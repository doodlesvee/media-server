import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Clapperboard, Film, Layers, Tv } from "lucide-react";
import { fetchCategories } from "@/lib/categoryApi";

// Icons for the categories that ship by default. Anything you add gets a
// neutral one — the label is what identifies it.
const ICONS: Record<string, typeof Film> = {
  video: Film,
  movie: Clapperboard,
  series: Tv,
};

export function KindTiles() {
  const { data } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const categories = data?.categories ?? [];

  if (categories.length === 0) return null;

  return (
    // Centred as a group, with each tile a fixed width so they stay compact
    // however wide the page gets.
    <div className="flex flex-wrap justify-center gap-5 sm:gap-7">
      {categories.map((entry) => {
        const { slug, label, total, coverPositionX, coverPositionY, coverScale } = entry;
        const Icon = ICONS[slug] ?? Layers;
        // Your uploaded cover wins; otherwise fall back to the newest item's
        // artwork, so a category is never a blank card.
        const cover =
          entry.cover ??
          (entry.representativeItemId != null
            ? `/api/media-items/${entry.representativeItemId}/thumbnail`
            : null);

        return (
          <Link
            key={slug}
            to="/browse"
            search={{ kind: slug }}
            className="group relative flex h-40 w-72 items-center justify-center overflow-hidden rounded-lg bg-card/60 ring-1 ring-border transition-all duration-200 hover:ring-white/25 sm:h-44 sm:w-96"
          >
            {cover ? (
              // The zoom sits on a wrapper rather than the image so it
              // multiplies with the hover scale below instead of fighting it
              // — one transform per element, composed by nesting.
              <div
                className="absolute inset-0"
                style={{
                  transform: `scale(${coverScale / 100})`,
                  // Same percentages as object-position below, so the zoom
                  // reveals the side the crop is already showing rather than
                  // pulling away from it.
                  transformOrigin: `${coverPositionX}% ${coverPositionY}%`,
                }}
              >
                <img
                  src={cover}
                  alt=""
                  // Framing chosen in Site settings. The file is never
                  // cropped — this only picks which band of it shows.
                  style={{ objectPosition: `${coverPositionX}% ${coverPositionY}%` }}
                  className="h-full w-full scale-105 object-cover opacity-90 transition-all duration-500 group-hover:scale-110 group-hover:opacity-100"
                />
              </div>
            ) : (
              // Nothing to show a cover from yet — a soft wash beats a blank
              // slab, and it still reads as the same kind of card.
              <div className="absolute inset-0 bg-gradient-to-br from-secondary/70 via-card to-card" />
            )}

            {/* Shades the artwork rather than hiding it. This used to run
                90% → 60% → 30% over the full tile, on top of an image already
                dimmed to 45% — between them the cover was barely there. The
                text stays legible on the halo below instead, which costs a
                few pixels around the glyphs rather than the whole picture. */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-background/25 to-background/15" />

            <div className="relative flex flex-col items-center gap-1.5 [text-shadow:0_1px_8px_var(--background)]">
              <Icon
                className="size-7 text-foreground/90 drop-shadow-[0_1px_6px_var(--background)] transition-colors duration-200 group-hover:text-foreground sm:size-8"
                strokeWidth={1.5}
              />
              <span className="text-sm font-semibold tracking-tight sm:text-base">{label}</span>
              <span className="text-[11px] text-muted-foreground">
                {total === 0 ? "Empty" : `${total} ${total === 1 ? "item" : "items"}`}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
