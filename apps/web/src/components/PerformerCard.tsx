import { useState } from "react";
import {
  performerPortraitUrl,
  portraitStyle,
  type PerformerSummary,
} from "@/lib/performerApi";

// Re-exported because several components import the type from here. It used
// to be declared here too — a second, drifting copy of the one in
// performerApi, which is why adding portrait framing to that one silently
// failed to reach the cards.
export type { PerformerSummary };

export function PerformerCard({
  performer,
  onClick,
}: {
  performer: PerformerSummary;
  onClick: () => void;
}) {
  // A video-frame fallback can 404 — poster existence is a filesystem check,
  // not a DB fact — so a failed load drops to the initial rather than leaving
  // a broken image.
  const [imageFailed, setImageFailed] = useState(false);
  const portrait = performerPortraitUrl(performer);
  const showImage = portrait !== null && !imageFailed;

  return (
    <button
      type="button"
      onClick={onClick}
      title={performer.name}
      className="group relative aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-lg bg-secondary ring-1 ring-border transition-all duration-200 hover:ring-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:w-52"
    >
      {showImage ? (
        <img
          src={portrait}
          alt=""
          onError={() => setImageFailed(true)}
          style={portraitStyle(performer)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-3xl font-semibold text-muted-foreground">
          {performer.name.trim()[0]?.toUpperCase() ?? "?"}
        </span>
      )}

      {/* Name and action appear only on hover, so a wall of performers reads
          as portraits rather than a labelled list. */}
      <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
        {/* Lighter than before: with no centred button to keep legible, only
            the name needs backing, so the artwork stays visible on hover. */}
        <span className="absolute inset-0 bg-black/20" />

        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-3 text-left">
          <span className="line-clamp-2 text-sm font-semibold leading-tight text-white">
            {performer.name}
          </span>
          <span className="mt-0.5 block text-[11px] text-white/70">
            {performer.videoCount} {performer.videoCount === 1 ? "video" : "videos"}
          </span>
        </span>
      </span>
    </button>
  );
}
