import type { CoPerformer, YearGroup } from "./performerApi";

export type StudioSummary = {
  id: number;
  name: string;
  videoCount: number;
  representativeItemId: number | null;
};

/**
 * A performer credited on this studio's videos.
 *
 * The same shape a co-performer has — `together` counts videos *for this
 * studio*, while `videoCount` is their own catalogue — so the existing
 * portrait tile renders it without a second variant.
 */
export type StudioPerformer = CoPerformer;

export type StudioDetail = {
  id: number;
  name: string;
  videoCount: number;
  totalDurationSeconds: number;
  albumCount: number;
  years: YearGroup[];
  watch: { watched: number; inProgress: number; unwatched: number };
  performers: StudioPerformer[];
  representativeItemId: number | null;
  bannerItemId: number | null;
};

export async function fetchStudios(): Promise<{ studios: StudioSummary[] }> {
  const res = await fetch("/api/studios");
  if (!res.ok) throw new Error(`Failed to load studios: ${res.status}`);
  return res.json();
}

export async function fetchStudio(id: number): Promise<StudioDetail> {
  const res = await fetch(`/api/studios/${id}`);
  if (!res.ok) throw new Error(`Failed to load studio: ${res.status}`);
  return res.json();
}
