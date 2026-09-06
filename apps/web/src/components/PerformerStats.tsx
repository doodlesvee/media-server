import type { PerformerDetail } from "@/lib/performerApi";

function formatDuration(seconds: number): string | null {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * The shape of a performer's collection, in one line.
 *
 * Replaces a bare "27 videos · 14h total", which said nothing about what is
 * actually in there. Every figure is derived from the same set the grid below
 * renders, so the numbers and the page can't disagree.
 *
 * Each part is omitted when it would be noise — no year range for a performer
 * with no dated videos, no "unwatched" when you've seen everything — rather
 * than printing a row of zeroes.
 */
export function PerformerStats({ performer }: { performer: PerformerDetail }) {
  const duration = formatDuration(performer.totalDurationSeconds);

  // Only real studios; the null bucket is "no studio", not a studio.
  const studioCount = performer.studios.filter((s) => s.name !== null).length;
  const years = performer.years.map((y) => y.year).filter((y): y is number => y !== null);
  const [from, to] = [Math.min(...years), Math.max(...years)];

  const parts: string[] = [
    `${performer.videoCount} ${performer.videoCount === 1 ? "video" : "videos"}`,
  ];
  if (duration) parts.push(duration);
  if (studioCount > 0) parts.push(`${studioCount} ${studioCount === 1 ? "studio" : "studios"}`);
  if (years.length > 0) parts.push(from === to ? `${from}` : `${from}–${to}`);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {parts.map((part, index) => (
        <span key={part} className="flex items-center gap-2">
          {index > 0 && <span className="text-muted-foreground/40">·</span>}
          <span className={index === 0 ? "font-medium text-foreground/90" : undefined}>{part}</span>
        </span>
      ))}

      {performer.watch.unwatched > 0 && (
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground/40">·</span>
          <span>{performer.watch.unwatched} unwatched</span>
        </span>
      )}
    </div>
  );
}
