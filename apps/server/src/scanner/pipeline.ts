import { basename } from "node:path";
import { stat } from "node:fs/promises";
import { eq, inArray, sql } from "drizzle-orm";
import pLimit from "p-limit";
import { db } from "../db/client.js";
import {
  libraryRoots,
  mediaFiles,
  mediaItemPerformers,
  mediaItemTypes,
  mediaItems,
  performers,
  scanJobs,
} from "../db/schema.js";
import { probeVideo } from "../metadata/videoProbe.js";
import { probePhoto } from "../metadata/photoExif.js";
import { ensurePosterFrame, generatePosterFrame } from "../media/poster.js";
import { ensurePreviewClip } from "../media/preview.js";
import { classifyByExtension, mimeTypeFor, titleFromFilename, type MediaKind } from "./classify.js";
import {
  hasWordBoundaryMatch,
  isUsableMatchKey,
  matchKey,
  normalizeName,
  performerNameFromPath,
} from "./performerNames.js";
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
    // Files sitting directly at a library root have no folder to name a
    // performer, so they're deferred to a second pass once every
    // folder-derived performer exists.
    const rootLevelPaths: string[] = [];
    const limit = pLimit(CONCURRENCY);
    const tasks: Promise<void>[] = [];

    for (const root of roots) {
      for await (const filePath of walk(root.path)) {
        const kind = classifyByExtension(filePath);
        if (!kind) continue;

        seenPaths.add(filePath);
        if (performerNameFromPath(root.path, filePath) === null) {
          rootLevelPaths.push(filePath);
        }

        tasks.push(
          limit(async () => {
            await processFile(filePath, kind, root, itemTypeIdByKind);
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
    // Deliberately after every file has been processed: the set of performers
    // to match against grows during the walk, so doing this per-file would
    // give different results depending on the order the walk happened to
    // reach things.
    await assignPerformersFromFilenames(rootLevelPaths);
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
  root: { libraryId: number; path: string },
  itemTypeIdByKind: Map<string, number>
): Promise<void> {
  const libraryId = root.libraryId;
  const stats = await stat(filePath);

  const [existingFile] = await db.select().from(mediaFiles).where(eq(mediaFiles.path, filePath));

  if (existingFile) {
    await clearMissingSince(existingFile.mediaItemId);
    // Reconcile on every scan, not just at the moment a rename is detected —
    // that makes this self-healing for files renamed before this behaviour
    // existed, and it's a no-op once title and filename already agree.
    await syncTitleWithFilename(existingFile.mediaItemId, filePath);
    // Every already-known file takes this branch, so this is also what
    // backfills performers across a library that predates the feature.
    await syncPerformersWithPath(existingFile.mediaItemId, filePath, root.path);

    if (kind === "video") {
      await ensureArtworkForItem(existingFile.mediaItemId, filePath, existingFile.contentHash);
    }

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
    await syncTitleWithFilename(movedFile.mediaItemId, filePath);
    // A file relocated into a different performer's folder follows it, in
    // exactly the way its title follows a rename.
    await syncPerformersWithPath(movedFile.mediaItemId, filePath, root.path);
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

  await syncPerformersWithPath(item.id, filePath, root.path);

  if (kind === "video") {
    await generatePosterFrame(filePath, item.id, contentHash, durationSeconds);
    await ensurePreviewClip(filePath, item.id, contentHash, durationSeconds);
  }
}

/**
 * Resolves a performer name to its id, creating the row if needed.
 *
 * Written to survive the race that CONCURRENCY makes routine: two files under
 * the same folder are processed at once, both miss the lookup, and both
 * insert. Without onConflictDoNothing the second insert raises a unique
 * violation, which propagates out of processFile and fails the entire scan.
 */
async function ensurePerformerId(rawName: string): Promise<number> {
  const name = normalizeName(rawName);

  // lower(a) = lower(b) rather than ilike: `_` and `%` are LIKE wildcards, so
  // a performer named "Alice_B" would ilike-match "AliceXB". It also lets
  // Postgres use the lower(name) unique index.
  const findId = async (): Promise<number | null> => {
    const [row] = await db
      .select({ id: performers.id })
      .from(performers)
      .where(sql`lower(${performers.name}) = lower(${name})`);
    return row?.id ?? null;
  };

  const existing = await findId();
  if (existing !== null) return existing;

  const [created] = await db
    .insert(performers)
    .values({ name })
    .onConflictDoNothing()
    .returning();
  if (created) return created.id;

  // Lost the race — the winner's row is there now.
  const raced = await findId();
  if (raced === null) throw new Error(`Could not resolve performer "${name}"`);
  return raced;
}

/**
 * Points an item's performers at whatever its folder implies — but only while
 * the user hasn't taken ownership of them.
 *
 * Shaped like syncTitleWithFilename on purpose: same "scanner owns it until
 * you edit it" contract, same self-healing property across rescans.
 */
async function syncPerformersWithPath(
  mediaItemId: number,
  filePath: string,
  rootPath: string
): Promise<void> {
  const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaItemId));
  if (!item || item.performersSource !== "scanner") return;

  const name = performerNameFromPath(rootPath, filePath);
  if (!name) return; // root-level file — the filename pass handles these

  const performerId = await ensurePerformerId(name);

  const current = await db
    .select({ performerId: mediaItemPerformers.performerId })
    .from(mediaItemPerformers)
    .where(eq(mediaItemPerformers.mediaItemId, mediaItemId));

  // Bail when they already agree. A blind delete-then-insert would rewrite
  // added_at on every row of every scan.
  if (current.length === 1 && current[0].performerId === performerId) return;

  // While the scanner still owns this item the folder is the whole truth, so
  // replace rather than add: a file moved out of one performer's folder must
  // stop being credited to them.
  await db.delete(mediaItemPerformers).where(eq(mediaItemPerformers.mediaItemId, mediaItemId));
  await db
    .insert(mediaItemPerformers)
    .values({ mediaItemId, performerId })
    .onConflictDoNothing();
}

/**
 * Second pass for files sitting directly at a library root, where there's no
 * folder to name a performer. Matches the filename against performers that
 * already exist — it never invents a name out of a filename, so a performer
 * has to come from a folder or from you before anything can match it.
 *
 * Additive only, unlike the folder pass: a folder is an authoritative
 * statement about a file, a filename substring is only a suggestion. If this
 * replaced instead, renaming a performer would silently strip every
 * root-level link on the next scan.
 */
async function assignPerformersFromFilenames(filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return;

  const all = await db.select({ id: performers.id, name: performers.name }).from(performers);
  const candidates = all
    .map((p) => ({ id: p.id, key: matchKey(p.name) }))
    .filter((p) => isUsableMatchKey(p.key));
  if (candidates.length === 0) return;

  const rows = await db
    .select({
      path: mediaFiles.path,
      mediaItemId: mediaFiles.mediaItemId,
      performersSource: mediaItems.performersSource,
    })
    .from(mediaFiles)
    .innerJoin(mediaItems, eq(mediaItems.id, mediaFiles.mediaItemId))
    .where(inArray(mediaFiles.path, filePaths));

  for (const row of rows) {
    if (row.performersSource !== "scanner") continue;

    const haystack = matchKey(basename(row.path).replace(/\.[^./]+$/, ""));
    let matched = candidates.filter((c) => hasWordBoundaryMatch(haystack, c.key));

    // Drop any match wholly contained in another, so "Dani Daniels" wins over
    // a separate performer named "Dani".
    matched = matched.filter(
      (m) => !matched.some((other) => other.id !== m.id && other.key.includes(m.key))
    );
    if (matched.length === 0) continue;

    await db
      .insert(mediaItemPerformers)
      .values(matched.map((m) => ({ mediaItemId: row.mediaItemId, performerId: m.id })))
      .onConflictDoNothing();
  }
}

/**
 * Rebuilds a video's poster frame and preview clip if either isn't cached
 * (e.g. after the cache directory is cleared).
 */
async function ensureArtworkForItem(
  mediaItemId: number,
  filePath: string,
  contentHash: string | null
): Promise<void> {
  const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaItemId));
  if (!item) return;
  await ensurePosterFrame(filePath, mediaItemId, contentHash, item.durationSeconds);
  await ensurePreviewClip(filePath, mediaItemId, contentHash, item.durationSeconds);
}

/**
 * After a file moves or is renamed, bring its title along — but only if the
 * title is still the one the scanner derived. Once it's been edited in the
 * app (`titleSource === 'user'`) the filename stops being authoritative.
 */
async function syncTitleWithFilename(mediaItemId: number, filePath: string): Promise<void> {
  const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaItemId));
  if (!item || item.titleSource !== "filename") return;

  const derived = titleFromFilename(filePath);
  if (!derived || derived === item.title) return;

  await db
    .update(mediaItems)
    .set({ title: derived, updatedAt: new Date() })
    .where(eq(mediaItems.id, mediaItemId));
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
