import { useQuery } from "@tanstack/react-query";

/**
 * The full `/api/stats` response.
 *
 * One type for the whole payload rather than a narrow shape per consumer: the
 * footer, sidebar, notification centre and settings panel each read a
 * different slice, and when they declared those slices separately it stopped
 * being obvious they were all the same request.
 */
export type LibraryStats = {
  videos: number;
  photos: number;
  folders: number;
  /** Bytes on disk, across every file the library can currently see. */
  totalBytes: number;
  tags: number;
  collections: number;
  /**
   * Library health, over videos alone.
   *
   * Deliberately not the whole library: an album of stills is scanned
   * alongside the video it came with, and counting those made the health
   * figure mostly a statement about photos. `videos`, `photos` and
   * `totalBytes` above still describe everything, for the footer's summary.
   */
  videoTotal: number;
  videoMissing: number;
  videoBytes: number;
  videoDuplicateGroups: number;
  lastScan: {
    status: string;
    finishedAt: string | null;
    startedAt: string;
  } | null;
  lastBackup: string | null;
};

/**
 * The one cache key for `/api/stats`. Import this to invalidate it — never
 * spell the key inline.
 *
 * This endpoint was previously cached under two keys ("stats" for the footer,
 * "library-health" for everything else), so invalidating after a scan
 * refreshed the footer and left the other three surfaces stale until a page
 * reload. Exporting the key is what keeps that from drifting apart again.
 */
export const libraryStatsKey = ["library-stats"] as const;

export async function fetchLibraryStats(): Promise<LibraryStats> {
  const response = await fetch("/api/stats");
  if (!response.ok) throw new Error(`Failed to load stats: ${response.status}`);
  return response.json();
}

export function useLibraryStats() {
  return useQuery({
    queryKey: libraryStatsKey,
    queryFn: fetchLibraryStats,
    staleTime: 30_000,
  });
}

/**
 * Binary units, because that's what a filesystem reports — a 2TB drive shows
 * as 1.8TB in Finder, and a footer that disagreed with the OS would just be
 * confusing.
 */
export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  // One decimal once past megabytes; a fractional byte count is noise.
  return `${value.toFixed(exponent >= 2 ? 1 : 0)} ${units[exponent]}`;
}
