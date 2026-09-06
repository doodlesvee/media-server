import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/client.js";
import { libraries, libraryRoots, mediaFiles, mediaItems, performers, studios } from "../db/schema.js";
import { resetDatabase, testApp } from "../test/harness.js";
import { seed } from "../db/seed.js";
import { startScan, isScanRunning } from "./pipeline.js";

let root: string;

/** Waits for whatever scan is in flight to finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 200 && isScanRunning(); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (isScanRunning()) throw new Error("scan did not finish");
}

/** Runs a scan and waits for it, since startScan returns as soon as it begins. */
async function scan(): Promise<void> {
  await startScan();
  await settle();
}

async function put(relative: string, contents = "video-bytes"): Promise<string> {
  const full = path.join(root, relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, contents);
  return full;
}

const titles = async () =>
  (await db.select({ title: mediaItems.title }).from(mediaItems)).map((r) => r.title).sort();

beforeEach(async () => {
  await testApp();
  await resetDatabase();
  // seed() creates the media_item_types the scanner classifies into.
  await seed();
  root = await mkdtemp(path.join(tmpdir(), "scan-test-"));
  const [library] = await db.insert(libraries).values({ name: "Test" }).returning();
  await db.insert(libraryRoots).values({ libraryId: library.id, path: root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("scanning", () => {
  it("imports a video and skips files it does not recognise", async () => {
    await put("Alice/movie.mp4");
    await put("Alice/notes.txt");
    await scan();
    expect(await titles()).toEqual(["movie"]);
  });

  it("derives the performer from the folder", async () => {
    await put("Alice/movie.mp4");
    await scan();
    expect((await db.select().from(performers)).map((p) => p.name)).toEqual(["Alice"]);
  });

  it("derives the studio from a studio sub-folder", async () => {
    await put("Alice/Vixen/movie.mp4");
    await scan();
    expect((await db.select().from(studios)).map((s) => s.name)).toEqual(["Vixen"]);
  });

  it("reads studio, cast, date and title from a declared filename", async () => {
    await put("Alice/[Vixen] Alice, Bella - 02.15.2020 - Main Event.mp4");
    await scan();

    const [item] = await db.select().from(mediaItems);
    expect(item.title).toBe("Main Event");
    expect(item.releaseDate).toBe("2020-02-15");
    expect((await db.select().from(performers)).map((p) => p.name).sort()).toEqual([
      "Alice",
      "Bella",
    ]);
  });

  it("credits one file to two performers, so no copy is needed", async () => {
    await put("Alice/[V] Alice, Bella - Shared.mp4");
    await scan();
    expect(await db.select().from(mediaFiles)).toHaveLength(1);
    expect(await db.select().from(performers)).toHaveLength(2);
  });

  it("is idempotent: a second scan changes nothing", async () => {
    await put("Alice/[V] Alice, Bella - 02.15.2020 - Shared.mp4");
    await scan();
    const before = await db.select().from(mediaItems);
    await scan();
    const after = await db.select().from(mediaItems);

    expect(after).toHaveLength(before.length);
    // updatedAt churn on every scan is the symptom of a sync that compares
    // the wrong thing — it was exactly this for two-performer items.
    expect(after[0].updatedAt).toEqual(before[0].updatedAt);
  });

  it("follows a rename, keeping the same item and its edits", async () => {
    const original = await put("Alice/before.mp4", "unique-content-here");
    await scan();
    const [item] = await db.select().from(mediaItems);
    await db.update(mediaItems).set({ isFavorite: true }).where(eq(mediaItems.id, item.id));

    await rename(original, path.join(root, "Alice/after.mp4"));
    await scan();

    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(item.id);
    expect(items[0].isFavorite).toBe(true);
    expect(items[0].title).toBe("after");
  });

  it("follows a move into another performer's folder", async () => {
    const original = await put("Alice/movie.mp4", "unique-move-content");
    await scan();
    await mkdir(path.join(root, "Bella"), { recursive: true });
    await rename(original, path.join(root, "Bella/movie.mp4"));
    await scan();

    const [item] = await db.select().from(mediaItems);
    const linked = await db.query.mediaItemPerformers.findMany({
      where: (t, { eq: e }) => e(t.mediaItemId, item.id),
    });
    const names = await db.select().from(performers);
    const linkedNames = linked.map(
      (l) => names.find((n) => n.id === l.performerId)?.name
    );
    expect(linkedNames).toEqual(["Bella"]);
  });

  it("leaves a hand-edited title alone on the next scan", async () => {
    await put("Alice/movie.mp4");
    await scan();
    const [item] = await db.select().from(mediaItems);
    await db
      .update(mediaItems)
      .set({ title: "My Title", titleSource: "user" })
      .where(eq(mediaItems.id, item.id));

    await scan();
    const [after] = await db.select().from(mediaItems);
    expect(after.title).toBe("My Title");
  });

  it("flags a deleted file as missing rather than dropping its metadata", async () => {
    const file = await put("Alice/movie.mp4");
    await scan();
    await rm(file);
    await scan();

    const [item] = await db.select().from(mediaItems);
    expect(item.missingSince).not.toBeNull();
  });

  it("ignores bookkeeping folders", async () => {
    await put(".Trash-1000/junk.mp4");
    await put("@eaDir/junk.mp4");
    await scan();
    // They import, but must not become performers named after the folder.
    expect(await db.select().from(performers)).toEqual([]);
  });

  it("refuses to start a second scan while one is running", async () => {
    // The slot is reserved synchronously, before the first await — otherwise
    // two near-simultaneous requests could both see "idle" and both scan.
    await put("Alice/movie.mp4");
    await startScan();
    await expect(startScan()).rejects.toThrow(/already running/i);
    await settle();
  });
});
