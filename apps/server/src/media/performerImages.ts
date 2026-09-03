import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PERFORMER_IMAGES_DIR } from "./cache.js";

export type PerformerImageKind = "avatar" | "banner";

// Avatars are cropped square up front — they're always shown in a circle, so
// there's nothing to reposition later.
const AVATAR_SIZE = 512;

// Banners are only bounded, never cropped. Keeping the full frame is what
// makes the drag-to-reposition control possible: the visible band is chosen
// at display time via CSS object-position, so it stays adjustable forever
// rather than being baked in at upload.
const BANNER_MAX_WIDTH = 1920;
const BANNER_MAX_HEIGHT = 1920;

const JPEG_QUALITY = 82;

/** Guards against a huge upload being buffered and decoded. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export function performerImagePath(fileName: string): string {
  return path.join(PERFORMER_IMAGES_DIR, fileName);
}

/**
 * Normalises an uploaded image and writes it to the performer-images cache,
 * returning the generated filename to store on the row.
 *
 * The random suffix means replacing an image always produces a new URL, so a
 * previously-cached copy in the browser can never mask the new one.
 */
export async function savePerformerImage(
  buffer: Buffer,
  performerId: number,
  kind: PerformerImageKind
): Promise<string> {
  await mkdir(PERFORMER_IMAGES_DIR, { recursive: true });

  const fileName = `${performerId}-${kind}-${randomBytes(6).toString("hex")}.jpg`;

  // .rotate() honours EXIF orientation before anything else measures the
  // image. sharp throws on input it can't decode, which is what rejects a
  // non-image wearing an image extension.
  const pipeline = sharp(buffer).rotate();

  if (kind === "avatar") {
    pipeline.resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" });
  } else {
    // `inside` bounds the image without cropping and never enlarges a small
    // one, so the whole picture survives for repositioning.
    pipeline.resize(BANNER_MAX_WIDTH, BANNER_MAX_HEIGHT, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  await pipeline.jpeg({ quality: JPEG_QUALITY }).toFile(performerImagePath(fileName));

  return fileName;
}

/** Best-effort: a leftover file is clutter, not a correctness problem. */
export async function deletePerformerImage(fileName: string | null): Promise<void> {
  if (!fileName) return;
  try {
    await rm(performerImagePath(fileName), { force: true });
  } catch {
    // ignore — the row is what matters
  }
}
