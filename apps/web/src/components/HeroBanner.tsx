import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Play } from "lucide-react";
import { useAccentColor } from "@/lib/dominantColor";
import { framingStyle, thumbnailUrl } from "@/lib/mediaItemApi";
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
  hovering,
  onPlay,
  onMoreInfo,
}: {
  item: MediaCardItem;
  hovering: boolean;
  onPlay: (id: number) => void;
  onMoreInfo: (id: number) => void;
}) {
  // The clip only mounts on hover, so a page load never downloads five of
  // them — and the still-to-motion swap is something you asked for rather
  // than something that happens at you, which is what made autoplay here
  // feel wrong every time.
  const [clipReady, setClipReady] = useState(false);
  useEffect(() => {
    if (!hovering) setClipReady(false);
  }, [hovering]);

  const imageSrc = thumbnailUrl(item);
  // Each slide takes its palette from its own artwork, so the accent always
  // belongs to the picture rather than being a brand colour laid over it.
  const accent = useAccentColor(imageSrc);
  const duration = formatDuration(item.durationSeconds);
  const badge = resolutionBadge(item);

  return (
    <>
      {/* The item's thumbnail — your uploaded image when there is one, the
          generated poster otherwise. */}
      <img
        src={imageSrc}
        alt=""
        style={framingStyle(item)}
        className="absolute inset-0 h-full w-full object-cover"
      />

      {hovering && item.itemType === "video" && (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- silent ambient preview
        <video
          src={`/api/media-items/${item.id}/preview`}
          onCanPlay={() => setClipReady(true)}
          muted
          loop
          autoPlay
          playsInline
          preload="auto"
          // Fades in only once it can actually play, so the image never blinks
          // to black while the clip buffers.
          style={{ opacity: clipReady ? 1 : 0 }}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
        />
      )}

      {/* Scrims, kept light: enough contrast for the title and buttons
          without burying the picture the way the old full-height one did. */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-transparent to-transparent" />
      {accent && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-25 mix-blend-soft-light transition-opacity duration-500"
          style={{ background: `linear-gradient(to top right, ${accent}, transparent 60%)` }}
        />
      )}

      <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-end gap-4 px-6 pb-20">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.25em] transition-colors duration-500"
          style={{ color: accent ?? undefined }}
        >
          Featured
        </span>

        <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-balance sm:text-5xl">
          {item.title}
        </h1>

        <div className="flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
          {duration && <span className="font-medium text-foreground/90">{duration}</span>}
          {badge && (
            <span
              className="rounded border px-1.5 py-px text-[11px] tracking-wide transition-colors duration-500"
              style={
                accent
                  ? { borderColor: accent, color: accent }
                  : undefined
              }
            >
              {badge}
            </span>
          )}
          {item.studio && (
            <span
              className="font-medium transition-colors duration-500"
              style={{ color: accent ?? undefined }}
            >
              {item.studio}
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

        {item.performers && item.performers.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="text-muted-foreground/60">Starring </span>
            <span
              className="font-medium transition-colors duration-500"
              style={{ color: accent ?? undefined }}
            >
              {item.performers.map((p) => p.name).join(", ")}
            </span>
          </p>
        )}

        <div className="mt-1 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onPlay(item.id)}
            style={{ backgroundColor: accent ?? undefined }}
            className="flex items-center gap-2 rounded-md bg-white px-6 py-2.5 font-semibold text-black transition-[transform,background-color] duration-500 hover:scale-[1.03]"
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
  const [hovering, setHovering] = useState(false);

  // Keyed on `index` so the countdown restarts after a manual jump too —
  // otherwise clicking an arrow mid-cycle could auto-advance a moment later.
  useEffect(() => {
    if (items.length < 2) return;
    // Rotation pauses while you're hovering: being yanked to the next item
    // part-way through a preview you deliberately started is worse than the
    // carousel simply waiting.
    if (hovering) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearTimeout(timer);
  }, [index, items.length, hovering]);

  function go(direction: 1 | -1) {
    setIndex((i) => (i + direction + items.length) % items.length);
  }

  if (items.length === 0) return null;

  const item = items[index];

  return (
    <section
      className="relative h-[70vh] min-h-[500px] w-full overflow-hidden"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Only the current item is rendered — no sliding track, so switching
          featured items is a straight swap. */}
      <HeroSlide
        key={item.id}
        item={item}
        hovering={hovering}
        onPlay={onPlay}
        onMoreInfo={onMoreInfo}
      />

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
