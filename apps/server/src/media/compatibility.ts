const COMPATIBLE_CODECS = new Set(["h264", "vp8", "vp9", "av1"]);

export function playbackWarningFor(
  itemType: string,
  extraMetadata: Record<string, unknown> | null
): string | null {
  if (itemType !== "video") return null;

  const codec = extraMetadata?.codec;
  if (typeof codec !== "string") return null;

  if (!COMPATIBLE_CODECS.has(codec.toLowerCase())) {
    return `This video's codec (${codec}) may not play directly in your browser.`;
  }

  return null;
}
