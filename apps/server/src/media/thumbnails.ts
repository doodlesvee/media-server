import { access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { cacheFilename, ensureCacheDirs, POSTERS_DIR, THUMBNAILS_DIR } from "./cache.js";

const THUMBNAIL_WIDTH = 320;

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** For photos: generate a resized JPEG on first request, then reuse the cached file. */
export async function getOrCreatePhotoThumbnail(
  sourcePath: string,
  mediaItemId: number,
  contentHash: string | null
): Promise<string | null> {
  await ensureCacheDirs();
  const cachePath = path.join(THUMBNAILS_DIR, cacheFilename(mediaItemId, contentHash));

  if (await exists(cachePath)) {
    return cachePath;
  }

  try {
    await sharp(sourcePath).resize(THUMBNAIL_WIDTH).jpeg().toFile(cachePath);
    return cachePath;
  } catch {
    // Covers unsupported formats (e.g. HEIC without libheif support) — the
    // caller falls back to a generic icon rather than erroring out.
    return null;
  }
}

/** For videos: the poster frame is generated eagerly at scan time (see poster.ts); this just looks it up. */
export async function getPosterPath(
  mediaItemId: number,
  contentHash: string | null
): Promise<string | null> {
  const posterPath = path.join(POSTERS_DIR, cacheFilename(mediaItemId, contentHash));
  return (await exists(posterPath)) ? posterPath : null;
}
