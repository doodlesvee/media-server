import { mkdir } from "node:fs/promises";
import path from "node:path";

const appDataDir = process.env.APP_DATA_DIR ?? "./app-data";

export const THUMBNAILS_DIR = path.resolve(appDataDir, "thumbnails");
export const POSTERS_DIR = path.resolve(appDataDir, "posters");
export const PREVIEWS_DIR = path.resolve(appDataDir, "previews");
export const PERFORMER_IMAGES_DIR = path.resolve(appDataDir, "performer-images");
export const ITEM_THUMBNAILS_DIR = path.resolve(appDataDir, "item-thumbnails");
export const KIND_COVERS_DIR = path.resolve(appDataDir, "kind-covers");

export type AppDataDir = { name: string; dir: string };

/**
 * Directories holding files the user supplied, which nothing can rebuild.
 *
 * This list is what the backup copies, and `name` is the folder it lands in
 * inside the archive — so a directory missing from here is a directory you
 * silently lose.
 *
 * That is not hypothetical: `kind-covers` was absent for as long as it had
 * existed. The database dump still carried `categories.cover_file`, so a
 * restore produced rows pointing at files that were never in the archive, and
 * the category tiles came back blank with no record of which image was where.
 * The list lived in three places — here, the backup, and scripts/restore.sh —
 * and only one of them knew about it.
 */
export const UPLOAD_DIRS: AppDataDir[] = [
  { name: "performer-images", dir: PERFORMER_IMAGES_DIR },
  { name: "item-thumbnails", dir: ITEM_THUMBNAILS_DIR },
  { name: "kind-covers", dir: KIND_COVERS_DIR },
];

/**
 * Artwork the app generates from the media files themselves.
 *
 * Deliberately not backed up: ffmpeg and sharp rebuild all of it on the next
 * scan, and including it takes an archive from a few megabytes to hundreds —
 * which in practice means the backup stops being run.
 */
export const DERIVED_DIRS: AppDataDir[] = [
  { name: "thumbnails", dir: THUMBNAILS_DIR },
  { name: "posters", dir: POSTERS_DIR },
  { name: "previews", dir: PREVIEWS_DIR },
];

/**
 * Every directory under APP_DATA_DIR, each one classified.
 *
 * Adding a directory means adding it to `UPLOAD_DIRS` or `DERIVED_DIRS` —
 * deciding whether losing it matters. cache.test.ts fails on any `*_DIR`
 * export that appears in neither.
 */
export const APP_DATA_DIRS: AppDataDir[] = [...UPLOAD_DIRS, ...DERIVED_DIRS];

export async function ensureCacheDirs(): Promise<void> {
  // Driven off the list rather than naming each one again: this function was
  // a fourth copy that had to be kept in step with the other three.
  await Promise.all(
    APP_DATA_DIRS.map(({ dir }) => mkdir(dir, { recursive: true })),
  );
}

export function cacheFilename(
  mediaItemId: number,
  contentHash: string | null,
  extension = "jpg"
): string {
  return `${mediaItemId}-${contentHash ?? "nohash"}.${extension}`;
}
