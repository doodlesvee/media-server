import { Link } from "@tanstack/react-router";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import type { StudioSummary } from "@/lib/studioApi";

/**
 * A studio tile, shared by the studios page and the homepage row.
 *
 * 16:9 rather than the performers' 2:3 portrait: the artwork is a frame from
 * one of their videos, and cropping a widescreen still into a portrait throws
 * most of it away. A studio has no artwork of its own — there's no external
 * metadata source here to fetch a logo from.
 *
 * A flat dark overlay covers the whole frame with the name centred over it,
 * so the card reads as a label rather than as a claim about what you're
 * looking at — one scene's still standing in for a whole catalogue. Even
 * rather than graded, so the name sits on the same tone wherever the frame
 * happens to be bright.
 */
export function StudioCard({ studio, className }: { studio: StudioSummary; className?: string }) {
  // The count is deliberately not shown: the name is the whole label, and a
  // "1 video" line under half of them made the row read as a list of gaps.
  return (
    <Link
      to="/studio/$studioId"
      params={{ studioId: String(studio.id) }}
      className={`group block focus-visible:outline-none ${className ?? ""}`}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-secondary ring-1 ring-border transition-all duration-200 group-hover:ring-white/40">
        {studio.representativeItemId != null ? (
          <img
            src={thumbnailUrl({ id: studio.representativeItemId })}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-secondary to-background" />
        )}

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 px-3 text-center transition-colors duration-200 group-hover:bg-black/45">
          <h3 className="sensitive line-clamp-2 text-xl font-semibold leading-tight tracking-tight text-white drop-shadow sm:text-2xl">
            {studio.name}
          </h3>
        </div>
      </div>
    </Link>
  );
}
