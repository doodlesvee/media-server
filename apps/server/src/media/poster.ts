import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { cacheFilename, ensureCacheDirs, POSTERS_DIR } from "./cache.js";

const execFileAsync = promisify(execFile);

export async function generatePosterFrame(
  videoPath: string,
  mediaItemId: number,
  contentHash: string | null,
  durationSeconds: number | null
): Promise<void> {
  await ensureCacheDirs();

  const offset =
    durationSeconds && durationSeconds > 0 ? Math.min(1, durationSeconds / 2) : 0;
  const outputPath = path.join(POSTERS_DIR, cacheFilename(mediaItemId, contentHash));

  try {
    await execFileAsync("ffmpeg", [
      "-ss",
      String(offset),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-y",
      outputPath,
    ]);
  } catch {
    // Poster generation is best-effort: a missing poster just falls back to
    // the generic icon in the UI, it never fails the scan itself.
  }
}
