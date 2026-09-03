export type PerformerSummary = {
  id: number;
  name: string;
  hasImage: boolean;
  hasBanner: boolean;
  videoCount: number;
  representativeItemId: number | null;
};

export type PerformerDetail = PerformerSummary & {
  totalDurationSeconds: number;
  /** Which horizontal band of the banner is visible, for CSS object-position. */
  bannerPositionY: number;
  /** A different video's frame from the portrait where one exists, so the
   *  blurred backdrop isn't the same picture twice. */
  bannerItemId: number | null;
};

export type PerformerImageKind = "avatar" | "banner";

/**
 * URL for an uploaded performer image.
 *
 * `hasImage`/`hasBanner` is folded into the URL rather than checked at the
 * call site so a performer with nothing uploaded yields null, and callers
 * render their video-frame fallback instead of requesting a known 404.
 */
export function performerImageUrl(
  performer: { id: number; hasImage: boolean; hasBanner: boolean },
  kind: PerformerImageKind
): string | null {
  const present = kind === "banner" ? performer.hasBanner : performer.hasImage;
  return present ? `/api/performers/${performer.id}/image?kind=${kind}` : null;
}

/**
 * The best available portrait for a performer, in preference order:
 * an uploaded photo, then an uploaded banner, then a frame from one of their
 * videos. Falling back to the banner means a picture you uploaded always
 * shows up somewhere, even if you only filled one of the two slots.
 *
 * Single source of truth so the homepage row, the modal and the profile page
 * can't disagree about which image to show.
 */
export function performerPortraitUrl(performer: {
  id: number;
  hasImage: boolean;
  hasBanner: boolean;
  representativeItemId: number | null;
}): string | null {
  if (performer.hasImage) return `/api/performers/${performer.id}/image?kind=avatar`;
  if (performer.hasBanner) return `/api/performers/${performer.id}/image?kind=banner`;
  if (performer.representativeItemId != null) {
    return `/api/media-items/${performer.representativeItemId}/thumbnail`;
  }
  return null;
}

export async function fetchPerformer(id: number): Promise<PerformerDetail> {
  const res = await fetch(`/api/performers/${id}`);
  if (!res.ok) throw new Error(`Failed to load performer: ${res.status}`);
  return res.json();
}

export async function saveBannerPosition(id: number, bannerPositionY: number): Promise<void> {
  const res = await fetch(`/api/performers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bannerPositionY }),
  });
  if (!res.ok) throw new Error(`Failed to save banner position: ${res.status}`);
}

export async function uploadPerformerImage(
  id: number,
  kind: PerformerImageKind,
  file: File
): Promise<void> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/performers/${id}/image?kind=${kind}`, { method: "POST", body });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `Upload failed: ${res.status}`);
  }
}

export async function deletePerformerImage(id: number, kind: PerformerImageKind): Promise<void> {
  const res = await fetch(`/api/performers/${id}/image?kind=${kind}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to remove image: ${res.status}`);
}
