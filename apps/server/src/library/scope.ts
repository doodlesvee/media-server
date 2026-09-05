import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  libraryRoots,
  mediaFiles,
  mediaItemPerformers,
  mediaItems,
  performers,
  studios,
} from "../db/schema.js";
import { POSTERS_DIR, PREVIEWS_DIR } from "../media/cache.js";

/**
 * Whether a file path sits inside a configured folder.
 *
 * Done in JS rather than SQL on purpose: the SQL form needs a LIKE pattern
 * built from a user-chosen filesystem path, and `_` and `%` are both legal in
 * folder names and both LIKE wildcards. At personal-library size the row count
 * is trivial, and `markMissingFiles` already takes the same approach.
 */
export function isUnderRoot(filePath: string, rootPath: string): boolean {
  return filePath === rootPath || filePath.startsWith(rootPath + "/");
}

/**
 * Recomputes which files belong to which folder, and which items are visible.
 *
 * One definition, called from all three places that can change the answer:
 * adding a folder, removing one, and finishing a scan. Anything else risks the
 * two columns disagreeing.
 *
 * Folder items are deliberately untouched — they have no file at all, so any
 * "has a file under a watched folder" rule would be false for every one of
 * them and blank the folder picker.
 */
export async function recomputeScope(): Promise<void> {
  const roots = await db
    .select({ id: libraryRoots.id, path: libraryRoots.path })
    .from(libraryRoots);
  const files = await db
    .select({ id: mediaFiles.id, path: mediaFiles.path, mediaItemId: mediaFiles.mediaItemId })
    .from(mediaFiles);

  const inScopeItemIds: number[] = [];
  const outOfScopeItemIds: number[] = [];
  // Grouped so each root is a single UPDATE rather than one per file.
  const filesByRoot = new Map<number | null, number[]>();

  for (const file of files) {
    const owningRoot = roots.find((root) => isUnderRoot(file.path, root.path));
    const key = owningRoot?.id ?? null;
    const bucket = filesByRoot.get(key) ?? [];
    bucket.push(file.id);
    filesByRoot.set(key, bucket);
    (owningRoot ? inScopeItemIds : outOfScopeItemIds).push(file.mediaItemId);
  }

  for (const [rootId, fileIds] of filesByRoot) {
    if (fileIds.length === 0) continue;
    await db.update(mediaFiles).set({ rootId }).where(inArray(mediaFiles.id, fileIds));
  }

  if (inScopeItemIds.length > 0) {
    await db
      .update(mediaItems)
      .set({ inScope: true })
      .where(inArray(mediaItems.id, inScopeItemIds));
  }
  if (outOfScopeItemIds.length > 0) {
    await db
      .update(mediaItems)
      .set({ inScope: false })
      .where(inArray(mediaItems.id, outOfScopeItemIds));
  }

  // Folders hold no bytes and are never produced by a scan, so they stay
  // visible regardless of which folders are being watched.
  await db
    .update(mediaItems)
    .set({ inScope: true })
    .where(
      sql`${mediaItems.itemTypeId} in (select id from media_item_types where name = 'folder')`
    );
}

/** Convenience for the delete-root handler, which knows the root already. */
export async function clearScopeForRoot(rootId: number): Promise<void> {
  const affected = db
    .select({ id: mediaFiles.mediaItemId })
    .from(mediaFiles)
    .where(eq(mediaFiles.rootId, rootId));
  await db.update(mediaItems).set({ inScope: false }).where(inArray(mediaItems.id, affected));
  await db.update(mediaFiles).set({ rootId: null }).where(eq(mediaFiles.rootId, rootId));
}

/**
 * Removes performers and studios that no longer have a single visible item.
 *
 * These are debris from folders that are no longer scanned — a directory
 * called "Downloads" becoming a performer, say. Items themselves are only
 * ever hidden, never deleted, so this cleans the lists without touching
 * anything you authored.
 */
export async function purgeEmptyEntities(): Promise<{ performers: number; studios: number }> {
  const deadPerformers = await db
    .delete(performers)
    .where(
      sql`not exists (
        select 1 from ${mediaItemPerformers} mip
        join ${mediaItems} mi on mi.id = mip.media_item_id
        where mip.performer_id = ${performers.id} and mi.in_scope
      )`
    )
    .returning({ id: performers.id });

  const deadStudios = await db
    .delete(studios)
    .where(
      sql`not exists (
        select 1 from ${mediaItems} mi
        where mi.studio_id = ${studios.id} and mi.in_scope
      )`
    )
    .returning({ id: studios.id });

  return { performers: deadPerformers.length, studios: deadStudios.length };
}

/**
 * Deletes cached posters and preview clips whose item no longer exists.
 *
 * Safe by construction: everything here is regenerated from the source video
 * on the next scan, so the worst case of over-deleting is wasted CPU, never
 * lost data. Cache filenames start with "<itemId>-".
 */
export async function sweepOrphanedArtwork(): Promise<number> {
  const items = await db.select({ id: mediaItems.id }).from(mediaItems);
  const liveIds = new Set(items.map((i) => String(i.id)));

  let removed = 0;
  for (const dir of [POSTERS_DIR, PREVIEWS_DIR]) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue; // directory not created yet
    }
    for (const entry of entries) {
      const itemId = entry.split("-")[0];
      if (liveIds.has(itemId)) continue;
      await rm(path.join(dir, entry), { force: true });
      removed += 1;
    }
  }
  return removed;
}
