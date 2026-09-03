import { mkdir } from "node:fs/promises";
import path from "node:path";

const appDataDir = process.env.APP_DATA_DIR ?? "./app-data";

export const THUMBNAILS_DIR = path.resolve(appDataDir, "thumbnails");
export const POSTERS_DIR = path.resolve(appDataDir, "posters");

export async function ensureCacheDirs(): Promise<void> {
  await mkdir(THUMBNAILS_DIR, { recursive: true });
  await mkdir(POSTERS_DIR, { recursive: true });
}

export function cacheFilename(mediaItemId: number, contentHash: string | null): string {
  return `${mediaItemId}-${contentHash ?? "nohash"}.jpg`;
}
