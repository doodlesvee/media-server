import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { cacheFilename, ensureCacheDirs, POSTERS_DIR } from "./cache.js";
import { previewSegmentOffsets } from "./preview.js";

const execFileAsync = promisify(execFile);

// The poster is deliberately the first frame of the preview montage, not an
// independently chosen frame. Both HoverPreviewCard and the detail modal
// layer the clip over this still and fade it in, so if the two disagree the
// hand-off shows up as a visible jump the instant you hover.
function posterOffsetSeconds(durationSeconds: number | null): number {
  return previewSegmentOffsets(durationSeconds)[0];
}

export function posterPathFor(mediaItemId: number, contentHash: string | null): string {
  return path.join(POSTERS_DIR, cacheFilename(mediaItemId, contentHash));
}

export async function generatePosterFrame(
  videoPath: string,
  mediaItemId: number,
  contentHash: string | null,
  durationSeconds: number | null
): Promise<void> {
  await ensureCacheDirs();

  const offset = posterOffsetSeconds(durationSeconds);
  const outputPath = posterPathFor(mediaItemId, contentHash);

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

/**
 * Generates the poster only when one isn't already cached. Called for every
 * video on every scan, so deleting the posters directory is enough to have
 * them all rebuilt on the next scan.
 */
export async function ensurePosterFrame(
  videoPath: string,
  mediaItemId: number,
  contentHash: string | null,
  durationSeconds: number | null
): Promise<void> {
  try {
    await access(posterPathFor(mediaItemId, contentHash));
    return; // already cached
  } catch {
    // not there yet — fall through and build it
  }
  await generatePosterFrame(videoPath, mediaItemId, contentHash, durationSeconds);
}
