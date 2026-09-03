export type MediaKind = "video" | "photo";

const VIDEO_MIME_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/x-m4v",
};

const PHOTO_MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
};

function extname(filePath: string): string | null {
  const base = filePath.split("/").pop() ?? filePath;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  return base.slice(dot + 1).toLowerCase();
}

export function classifyByExtension(filePath: string): MediaKind | null {
  const ext = extname(filePath);
  if (!ext) return null;
  if (ext in VIDEO_MIME_TYPES) return "video";
  if (ext in PHOTO_MIME_TYPES) return "photo";
  return null;
}

export function mimeTypeFor(filePath: string): string {
  const ext = extname(filePath);
  if (!ext) return "application/octet-stream";
  return VIDEO_MIME_TYPES[ext] ?? PHOTO_MIME_TYPES[ext] ?? "application/octet-stream";
}

export function titleFromFilename(filePath: string): string {
  const base = filePath.split("/").pop() ?? filePath;
  const withoutExt = base.replace(/\.[^./]+$/, "");
  return withoutExt.replace(/[_-]+/g, " ").trim();
}
