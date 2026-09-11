import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Heart, Pin, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  performerPortraitUrl,
  portraitStyle,
  setPerformerFavorite,
  type PerformerSummary,
} from "@/lib/performerApi";
import { isPinned, togglePin } from "@/lib/pinned";
import { PerformerPeekPanel } from "./PerformerPeekPanel";

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
  const queryClient = useQueryClient();
  const [pinned, setPinned] = useState(() => isPinned(`performer:${performer.id}`));
  const [peekOpen, setPeekOpen] = useState(false);

  const favorite = useMutation({
    mutationFn: (next: boolean) => setPerformerFavorite(performer.id, next),
    onSuccess: () => {
      // The list re-sorts around this, so it has to come back from the server
      // rather than being patched in place.
      queryClient.invalidateQueries({ queryKey: ["performers"] });
      queryClient.invalidateQueries({ queryKey: ["performer", performer.id] });
    },
  });

  return (
    <>
    {/* A wrapper rather than the card itself being the button: the favourite
        toggle is a button too, and a button inside a button is invalid HTML —
        browsers drop the inner one, so the heart would simply not work. */}
    <div className="group relative aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-lg bg-secondary ring-1 ring-border transition-all duration-200 hover:ring-white/40 focus-within:ring-2 focus-within:ring-white sm:w-52">
      <button
        type="button"
        onClick={onClick}
        title={performer.name}
        className="block h-full w-full focus-visible:outline-none"
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

        {/* A dim on hover only — at rest the artwork is untouched, so the
            labels below sit on the picture rather than over a greyed one. */}
        <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/20" />

        {/* Always visible: a wall of unlabelled portraits looks tidy but makes
            you hover every one to find anybody. The gradient is what keeps the
            text legible over whatever the picture happens to be doing here. */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 pt-8 text-left">
          <span className="sensitive line-clamp-2 text-sm font-semibold leading-tight text-white drop-shadow">
            {performer.name}
          </span>
          <span className="mt-0.5 block text-[11px] text-white/75">
            {performer.videoCount} {performer.videoCount === 1 ? "video" : "videos"}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          togglePin({ id: `performer:${performer.id}`, type: "performer", label: performer.name, performerId: performer.id });
          setPinned((value) => !value);
        }}
        aria-pressed={pinned}
        aria-label={pinned ? `Unpin ${performer.name}` : `Pin ${performer.name}`}
        title={pinned ? "Unpin" : "Pin"}
        className={cn("absolute left-2 top-2 z-10 flex size-8 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20 backdrop-blur-sm transition-all hover:bg-black/85 md:opacity-0 md:group-hover:opacity-100", pinned && "md:opacity-100")}
      >
        <Pin className={cn("size-4", pinned && "fill-white")} />
      </button>

      <button
        type="button"
        onClick={() => favorite.mutate(!performer.isFavorite)}
        disabled={favorite.isPending}
        aria-pressed={performer.isFavorite}
        aria-label={
          performer.isFavorite
            ? `Remove ${performer.name} from favourites`
            : `Add ${performer.name} to favourites`
        }
        title={performer.isFavorite ? "Remove from favourites" : "Add to favourites"}
        className={cn(
          "absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20 backdrop-blur-sm transition-all hover:bg-black/85 focus-visible:opacity-100 disabled:opacity-50",
          // Hidden until hover on a pointer device, but a favourited card
          // keeps its heart — that mark is why the card is sitting at the top
          // of the page, so hiding it would make the ordering look arbitrary.
          // Small screens have no hover state, so it stays put there.
          "md:opacity-0 md:group-hover:opacity-100",
          performer.isFavorite && "md:opacity-100"
        )}
      >
        <Heart
          className={cn("size-4", performer.isFavorite && "fill-red-500 text-red-500")}
        />
      </button>

      {performer.representativeItemId != null && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            window.dispatchEvent(
              new CustomEvent("media-server:play-item", {
                detail: { id: performer.representativeItemId },
              })
            );
          }}
          aria-label={`Play ${performer.name}`}
          title="Play a video"
          className="absolute bottom-12 left-3 z-10 flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black opacity-0 shadow-lg transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Play className="size-3.5 fill-current" /> Play
        </button>
      )}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setPeekOpen(true);
        }}
        aria-label={`Peek ${performer.name}`}
        title="Peek performer"
        className="absolute bottom-12 right-3 z-10 flex size-8 items-center justify-center rounded-full bg-black/65 text-white opacity-0 ring-1 ring-white/20 backdrop-blur-sm transition-opacity hover:bg-black/90 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Eye className="size-4" />
      </button>
    </div>
    {peekOpen && <PerformerPeekPanel performer={performer} onClose={() => setPeekOpen(false)} />}
    </>
  );
}
