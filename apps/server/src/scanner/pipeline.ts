import { stat } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import pLimit from "p-limit";
import { db } from "../db/client.js";
import { libraryRoots, mediaFiles, mediaItemTypes, mediaItems, scanJobs } from "../db/schema.js";
import { probeVideo } from "../metadata/videoProbe.js";
import { probePhoto } from "../metadata/photoExif.js";
import { generatePosterFrame } from "../media/poster.js";
import { classifyByExtension, mimeTypeFor, titleFromFilename, type MediaKind } from "./classify.js";
import { partialContentHash } from "./hash.js";
import { walk } from "./walk.js";

const CONCURRENCY = 4;

// -1 is a synchronous "reserved" placeholder, distinct from both null (idle)
// and a real job id — see the race-condition note in startScan below.
let runningJobId: number | null = null;

export function isScanRunning(): boolean {
  return runningJobId !== null;
}

export async function startScan(): Promise<number> {
  if (runningJobId !== null) {
    throw new Error("A scan is already running");
  }

  // Reserve the slot synchronously, before the first `await`. Node's event
  // loop can interleave two near-simultaneous requests between the check
  // above and the `db.insert` below; without this, both could read
  // `runningJobId === null` and both start a scan.
  runningJobId = -1;

  let job: typeof scanJobs.$inferSelect;
  try {
    [job] = await db.insert(scanJobs).values({ status: "running" }).returning();
  } catch (err) {
    runningJobId = null;
    throw err;
  }
  runningJobId = job.id;

  // Fire and forget: the caller polls GET /api/scan/:id for progress.
  // Errors are recorded on the job row itself inside runScan.
  void runScan(job.id);

  return job.id;
}

async function runScan(jobId: number): Promise<void> {
  try {
    const typeRows = await db.select().from(mediaItemTypes);
    const itemTypeIdByKind = new Map(typeRows.map((t) => [t.name, t.id]));

    const roots = await db
      .select({ libraryId: libraryRoots.libraryId, path: libraryRoots.path })
      .from(libraryRoots);

    const seenPaths = new Set<string>();
    const limit = pLimit(CONCURRENCY);
    const tasks: Promise<void>[] = [];

    for (const root of roots) {
      for await (const filePath of walk(root.path)) {
        const kind = classifyByExtension(filePath);
        if (!kind) continue;

        seenPaths.add(filePath);

        tasks.push(
          limit(async () => {
            await processFile(filePath, kind, root.libraryId, itemTypeIdByKind);
            // Atomic DB-side increment: concurrent tasks finishing out of
            // order must not clobber each other's count (a JS-side counter
            // read-then-write across an `await` would race here).
            await db
              .update(scanJobs)
              .set({ filesScanned: sql`${scanJobs.filesScanned} + 1` })
              .where(eq(scanJobs.id, jobId));
          })
        );
      }
    }

    await Promise.all(tasks);
    await markMissingFiles(seenPaths);

    await db
      .update(scanJobs)
      .set({ status: "completed", finishedAt: new Date() })
      .where(eq(scanJobs.id, jobId));
  } catch (err) {
    await db
      .update(scanJobs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(scanJobs.id, jobId));
  } finally {
    runningJobId = null;
  }
}

async function processFile(
  filePath: string,
  kind: MediaKind,
  libraryId: number,
  itemTypeIdByKind: Map<string, number>
): Promise<void> {
  const stats = await stat(filePath);

  const [existingFile] = await db.select().from(mediaFiles).where(eq(mediaFiles.path, filePath));

  if (existingFile) {
    await clearMissingSince(existingFile.mediaItemId);

    const unchanged =
      Number(existingFile.sizeBytes) === stats.size &&
      existingFile.mtime.getTime() === stats.mtime.getTime();
    if (unchanged) return;

    const contentHash = await partialContentHash(filePath, stats.size);
    await db
      .update(mediaFiles)
      .set({ sizeBytes: stats.size, mtime: stats.mtime, contentHash })
      .where(eq(mediaFiles.id, existingFile.id));
    return;
  }

  const contentHash = await partialContentHash(filePath, stats.size);

  // Same content already tracked at a different path: treat as a move/rename
  // rather than a new item, so tags/collections attached later won't be lost.
  const [movedFile] = await db
    .select()
    .from(mediaFiles)
    .where(eq(mediaFiles.contentHash, contentHash));

  if (movedFile) {
    await db
      .update(mediaFiles)
      .set({ path: filePath, sizeBytes: stats.size, mtime: stats.mtime })
      .where(eq(mediaFiles.id, movedFile.id));
    await clearMissingSince(movedFile.mediaItemId);
    return;
  }

  const itemTypeId = itemTypeIdByKind.get(kind);
  if (!itemTypeId) {
    throw new Error(`Missing media_item_types row for "${kind}" — did seeding run?`);
  }

  const title = titleFromFilename(filePath);
  let durationSeconds: number | null = null;
  let takenAt: Date | null = null;
  let extraMetadata: Record<string, unknown>;

  if (kind === "video") {
    const probe = await probeVideo(filePath);
    durationSeconds = probe.durationSeconds;
    extraMetadata = {
      width: probe.width,
      height: probe.height,
      codec: probe.codec,
      containerFormat: probe.containerFormat,
      embeddedTitle: probe.embeddedTitle,
    };
  } else {
    const exif = await probePhoto(filePath);
    takenAt = exif.takenAt;
    extraMetadata = { cameraModel: exif.cameraModel, gps: exif.gps };
  }

  const [item] = await db
    .insert(mediaItems)
    .values({ libraryId, itemTypeId, title, durationSeconds, takenAt, extraMetadata })
    .returning();

  await db.insert(mediaFiles).values({
    mediaItemId: item.id,
    path: filePath,
    sizeBytes: stats.size,
    mtime: stats.mtime,
    contentHash,
    mimeType: mimeTypeFor(filePath),
  });

  if (kind === "video") {
    await generatePosterFrame(filePath, item.id, contentHash, durationSeconds);
  }
}

async function clearMissingSince(mediaItemId: number): Promise<void> {
  await db.update(mediaItems).set({ missingSince: null }).where(eq(mediaItems.id, mediaItemId));
}

async function markMissingFiles(seenPaths: Set<string>): Promise<void> {
  const allFiles = await db.select().from(mediaFiles);
  const now = new Date();

  for (const file of allFiles) {
    if (seenPaths.has(file.path)) continue;

    const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, file.mediaItemId));
    if (item && !item.missingSince) {
      await db.update(mediaItems).set({ missingSince: now }).where(eq(mediaItems.id, item.id));
    }
  }
}
