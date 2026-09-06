import { db } from "../db/client.js";
import {
  libraries,
  libraryRoots,
  mediaFiles,
  mediaItemPerformers,
  mediaItemTypes,
  mediaItems,
  performers,
  studios,
} from "../db/schema.js";
import { eq } from "drizzle-orm";

/**
 * Builders for the rows a route needs to have something to return.
 *
 * Written as functions rather than a fixed dataset so each test states the
 * shape it depends on. A shared "seed everything" fixture makes tests pass
 * for reasons the test doesn't mention, which is how a suite stops explaining
 * its own failures.
 */

/** A library whose root is a real directory, for tests that stream files. */
export async function makeLibraryAt(
  rootPath: string
): Promise<{ libraryId: number; rootId: number }> {
  const [library] = await db.insert(libraries).values({ name: "Disk" }).returning();
  const [root] = await db
    .insert(libraryRoots)
    .values({ libraryId: library.id, path: rootPath })
    .returning();
  return { libraryId: library.id, rootId: root.id };
}

export async function makeLibrary(): Promise<{ libraryId: number; rootId: number }> {
  const [library] = await db.insert(libraries).values({ name: "Test" }).returning();
  const [root] = await db
    .insert(libraryRoots)
    .values({ libraryId: library.id, path: "/media" })
    .returning();
  return { libraryId: library.id, rootId: root.id };
}

async function typeId(name: string): Promise<number> {
  const [row] = await db.select().from(mediaItemTypes).where(eq(mediaItemTypes.name, name));
  if (row) return row.id;
  const [created] = await db.insert(mediaItemTypes).values({ name }).returning();
  return created.id;
}

export async function makeItem(
  libraryId: number,
  overrides: Partial<typeof mediaItems.$inferInsert> = {}
): Promise<number> {
  const [item] = await db
    .insert(mediaItems)
    .values({
      libraryId,
      itemTypeId: await typeId("video"),
      title: "A Video",
      ...overrides,
    })
    .returning();
  return item.id;
}

export async function makePhoto(libraryId: number, title = "A Photo"): Promise<number> {
  const [item] = await db
    .insert(mediaItems)
    .values({ libraryId, itemTypeId: await typeId("photo"), title })
    .returning();
  return item.id;
}

export async function makeFolder(libraryId: number, title = "A Folder"): Promise<number> {
  const [item] = await db
    .insert(mediaItems)
    .values({ libraryId, itemTypeId: await typeId("folder"), title })
    .returning();
  return item.id;
}

export async function attachFile(
  mediaItemId: number,
  rootId: number,
  path: string,
  contentHash: string | null = null
): Promise<void> {
  await db.insert(mediaFiles).values({
    mediaItemId,
    rootId,
    path,
    sizeBytes: 1000,
    mtime: new Date(),
    mimeType: "video/mp4",
    contentHash,
  });
}

export async function makePerformer(name: string): Promise<number> {
  const [row] = await db.insert(performers).values({ name }).returning();
  return row.id;
}

export async function linkPerformer(mediaItemId: number, performerId: number): Promise<void> {
  await db.insert(mediaItemPerformers).values({ mediaItemId, performerId }).onConflictDoNothing();
}

export async function makeStudio(name: string): Promise<number> {
  const [row] = await db.insert(studios).values({ name }).returning();
  return row.id;
}
