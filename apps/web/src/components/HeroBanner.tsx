import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaCardItem } from "./MediaCard";

// How long each featured item stays before the hero rotates.
const ROTATE_MS = 14000;

const heroArrowClass =
  "absolute top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

function resolutionBadge(item: MediaCardItem): string | null {
  const height = item.extraMetadata?.height;
  if (typeof height !== "number") return null;
  if (height >= 2000) return "4K";
  if (height >= 1000) return "HD";
  return "SD";
}

function HeroSlide({
  item,
  onPlay,
  onMoreInfo,
}: {
  item: MediaCardItem;
  onPlay: (id: number) => void;
  onMoreInfo: (id: number) => void;
}) {
  const duration = formatDuration(item.durationSeconds);
  const badge = resolutionBadge(item);
  const progressPercent =
    item.lastPositionSeconds && item.durationSeconds
      ? Math.min(100, Math.round((item.lastPositionSeconds / item.durationSeconds) * 100))
      : null;

  return (
    <>
      {/* No artwork behind the hero — just a faint wash so the band reads as a
          distinct surface against the rows below it. */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-transparent" />

      <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-center gap-4 px-6">
        <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          Featured
        </span>

        <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-balance sm:text-5xl">
          {item.title}
        </h1>

        <div className="flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
          {duration && <span className="font-medium text-foreground/90">{duration}</span>}
          {badge && (
            <span className="rounded border border-border px-1.5 py-px text-[11px] tracking-wide">
              {badge}
            </span>
          )}
          {item.tags?.slice(0, 3).map((t) => (
            <span key={t.id} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">
              {t.name}
            </span>
          ))}
        </div>

        {item.description && (
          <p className="line-clamp-2 max-w-xl text-sm text-muted-foreground">
            {item.description}
          </p>
        )}

        {progressPercent !== null && (
          <div className="flex max-w-xs items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
              <span className="block h-full bg-white" style={{ width: `${progressPercent}%` }} />
            </span>
            {progressPercent}%
          </div>
        )}

        <div className="mt-1 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onPlay(item.id)}
            className="flex items-center gap-2 rounded-md bg-white px-6 py-2.5 font-semibold text-black transition-transform hover:scale-[1.03]"
          >
            <Play className="size-5 fill-black" />
            Play
          </button>
          <button
            type="button"
            onClick={() => onMoreInfo(item.id)}
            className="flex items-center gap-2 rounded-md bg-white/15 px-5 py-2.5 font-semibold backdrop-blur-sm transition-colors hover:bg-white/25"
          >
            <Info className="size-5" />
            More Info
          </button>
        </div>
      </div>
    </>
  );
}

export function HeroBanner({
  items,
  onPlay,
  onMoreInfo,
}: {
  items: MediaCardItem[];
  onPlay: (id: number) => void;
  onMoreInfo: (id: number) => void;
}) {
  const [index, setIndex] = useState(0);

  // Keyed on `index` so the countdown restarts after a manual jump too —
  // otherwise clicking an arrow mid-cycle could auto-advance a moment later.
  useEffect(() => {
    if (items.length < 2) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearTimeout(timer);
  }, [index, items.length]);

  function go(direction: 1 | -1) {
    setIndex((i) => (i + direction + items.length) % items.length);
  }

  if (items.length === 0) return null;

  const item = items[index];

  // Shorter than it was with artwork behind it — with only text to hold, the
  // old 80vh band was mostly empty space.
  return (
    <section className="relative h-[44vh] min-h-[360px] w-full overflow-hidden border-b border-border/60">
      {/* Only the current item is rendered — no sliding track, so switching
          featured items is a straight swap. */}
      <HeroSlide key={item.id} item={item} onPlay={onPlay} onMoreInfo={onMoreInfo} />

      {items.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous featured item"
            className={heroArrowClass + " left-4"}
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next featured item"
            className={heroArrowClass + " right-4"}
          >
            <ChevronRight className="size-6" />
          </button>
        </>
      )}

      {items.length > 1 && (
        <div className="absolute bottom-6 right-6 z-20 flex items-center gap-1.5">
          {items.map((candidate, i) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show featured item ${i + 1}`}
              className={cn(
                "h-1 rounded-full transition-all",
                i === index ? "w-6 bg-white" : "w-2 bg-white/40 hover:bg-white/70"
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
