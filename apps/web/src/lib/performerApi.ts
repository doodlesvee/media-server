import type React from "react";

export type PerformerSummary = {
  id: number;
  name: string;
  hasImage: boolean;
  hasBanner: boolean;
  videoCount: number;
  representativeItemId: number | null;
  /** Portrait framing. Defaults are 50 / 0 / 100 — centred, top-aligned. */
  imagePositionX: number;
  imagePositionY: number;
  imageScale: number;
};

/** A group in the profile's breakdown. `null` is the "unset" bucket. */
export type StudioGroup = { name: string | null; count: number };
export type YearGroup = { year: number | null; count: number };

/**
 * Spelled out rather than extending PerformerSummary: the co-performer query
 * returns what a portrait needs and how many videos they *share*, not their
 * own total video count. Inheriting the summary would claim a field the
 * endpoint never sends.
 */
export type CoPerformer = {
  id: number;
  name: string;
  hasImage: boolean;
  hasBanner: boolean;
  representativeItemId: number | null;
  imagePositionX: number;
  imagePositionY: number;
  imageScale: number;
  /** How many videos they share with the performer whose page this is. */
  together: number;
  /** Their own catalogue size, for the tile's "N videos" line. */
  videoCount: number;
};

export type PerformerDetail = PerformerSummary & {
  /** Free text, on the profile only — the list endpoint does not carry it. */
  bio: string | null;
  studios: StudioGroup[];
  years: YearGroup[];
  watch: { watched: number; inProgress: number; unwatched: number };
  coPerformers: CoPerformer[];
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

/**
 * Inline style applying a performer's portrait framing.
 *
 * Mirrors framingStyle for media thumbnails — the portrait appears on the
 * performers page, the home-page row and the detail modal's avatar, and all
 * three should crop it the same way.
 */
export function portraitStyle(performer: {
  imagePositionX?: number;
  imagePositionY?: number;
  imageScale?: number;
}): React.CSSProperties {
  const x = performer.imagePositionX ?? 50;
  // Top-aligned by default: faces are usually up there, which is why the
  // cards used to hardcode `object-top`.
  const y = performer.imagePositionY ?? 0;
  const scale = performer.imageScale ?? 100;
  return {
    objectPosition: `${x}% ${y}%`,
    transform: scale === 100 ? undefined : `scale(${scale / 100})`,
    transformOrigin: `${x}% ${y}%`,
  };
}

export async function savePerformerBio(id: number, bio: string): Promise<void> {
  const res = await fetch(`/api/performers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    // Sent alone: the endpoint accepts any single field without the name.
    body: JSON.stringify({ bio }),
  });
  if (!res.ok) throw new Error(`Failed to save bio: ${res.status}`);
}

export async function savePortraitFraming(
  id: number,
  framing: { imagePositionX: number; imagePositionY: number; imageScale: number }
): Promise<void> {
  const res = await fetch(`/api/performers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(framing),
  });
  if (!res.ok) throw new Error(`Failed to save portrait framing: ${res.status}`);
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
