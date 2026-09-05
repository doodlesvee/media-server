import { mkdir } from "node:fs/promises";
import path from "node:path";

const appDataDir = process.env.APP_DATA_DIR ?? "./app-data";

export const THUMBNAILS_DIR = path.resolve(appDataDir, "thumbnails");
export const POSTERS_DIR = path.resolve(appDataDir, "posters");
export const PREVIEWS_DIR = path.resolve(appDataDir, "previews");
// Unlike the others this holds user-uploaded originals, not derived artwork —
// deleting it loses data that can't be regenerated from the media files.
export const PERFORMER_IMAGES_DIR = path.resolve(appDataDir, "performer-images");
export const ITEM_THUMBNAILS_DIR = path.resolve(appDataDir, "item-thumbnails");
export const KIND_COVERS_DIR = path.resolve(appDataDir, "kind-covers");

export async function ensureCacheDirs(): Promise<void> {
  await mkdir(THUMBNAILS_DIR, { recursive: true });
  await mkdir(POSTERS_DIR, { recursive: true });
  await mkdir(PREVIEWS_DIR, { recursive: true });
  await mkdir(PERFORMER_IMAGES_DIR, { recursive: true });
  await mkdir(ITEM_THUMBNAILS_DIR, { recursive: true });
  await mkdir(KIND_COVERS_DIR, { recursive: true });
}

export function cacheFilename(
  mediaItemId: number,
  contentHash: string | null,
  extension = "jpg"
): string {
  return `${mediaItemId}-${contentHash ?? "nohash"}.${extension}`;
}
