import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check, Play, Plus } from "lucide-react";
import { addToMyList } from "@/lib/myList";
import { cn } from "@/lib/utils";
import type { MediaCardItem } from "./MediaCard";

const EXPANDED_SCALE = 1.85;
const VIEWPORT_MARGIN = 8;

// Kept in sync with the CSS transition duration below so the element isn't
// unmounted before its exit animation finishes.
const TRANSITION_MS = 280;

// The card animates from exactly the anchor card's rendered size up to full
// size. Starting anywhere above 1/EXPANDED_SCALE means the card pops to a
// visibly larger size on the first frame, which reads as a jump rather than
// a grow.
const START_SCALE = 1 / EXPANDED_SCALE;

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

export function HoverPreviewCard({
  item,
  anchorRect,
  onOpen,
  onPlay,
  onDismiss,
}: {
  item: MediaCardItem;
  anchorRect: DOMRect;
  onOpen: () => void;
  onPlay: () => void;
  onDismiss: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [added, setAdded] = useState(false);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const width = anchorRect.width * EXPANDED_SCALE;
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(
      anchorRect.left + anchorRect.width / 2 - width / 2,
      window.innerWidth - width - VIEWPORT_MARGIN
    )
  );
  // Centre the expanded video over the original thumbnail (both 16:9) so the
  // card appears to grow out of the card you're pointing at, rather than
  // jumping upward by a fixed amount.
  const thumbGrowth = (width - anchorRect.width) * (9 / 16);
  const top = Math.max(VIEWPORT_MARGIN, anchorRect.top - thumbGrowth / 2);

  // Where the anchor card's thumbnail centre falls inside this expanded card.
  const originX = anchorRect.left + anchorRect.width / 2 - left;
  const originY = anchorRect.top + (anchorRect.width * 9) / 16 / 2 - top;

  // Play the grow-in on the frame after mount so the browser has an initial
  // state to transition *from*. Re-runs when the anchor changes, which also
  // cancels any in-flight dismissal — otherwise hovering out and straight
  // back in would let the old timer close the freshly-reopened card.
  useEffect(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [anchorRect]);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    // Let the shrink-out finish before the element is actually removed.
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(onDismiss, TRANSITION_MS);
  }

  // Any scroll invalidates the anchor position, so dismiss rather than
  // letting the card float somewhere stale.
  useEffect(() => {
    const onScroll = () => dismiss();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  });

  async function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    await addToMyList(item.id);
    setAdded(true);
    void queryClient.invalidateQueries({ queryKey: ["collections"] });
    void queryClient.invalidateQueries({ queryKey: ["collection-items"] });
  }

  const duration = formatDuration(item.durationSeconds);
  const badge = resolutionBadge(item);

  return createPortal(
    <div
      style={{
        left,
        top,
        width,
        // Anchor the growth to where the original thumbnail actually sits
        // inside this card, so it expands out of that card even when the
        // card has been clamped away from centre at a viewport edge.
        transformOrigin: `${originX}px ${originY}px`,
        transform: visible ? "scale(1)" : `scale(${START_SCALE})`,
        opacity: visible ? 1 : 0,
        transition: `transform ${TRANSITION_MS}ms cubic-bezier(0.2, 0, 0, 1), opacity ${TRANSITION_MS}ms ease-out`,
        willChange: "transform, opacity",
      }}
      aria-hidden="true"
      className={cn(
        "fixed z-40 overflow-hidden rounded-lg bg-card shadow-2xl ring-1 ring-white/10",
        !visible && "pointer-events-none"
      )}
      onMouseLeave={dismiss}
      onClick={onOpen}
    >
      {item.itemType === "video" ? (
        // The thumbnail sits underneath rather than using the video's own
        // `poster`: fading the video in means opacity 0, which would hide a
        // poster attribute too and leave a blank panel.
        <div className="relative aspect-video w-full cursor-pointer">
          <img
            src={`/api/media-items/${item.id}/thumbnail`}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- silent hover preview */}
          <video
            ref={videoRef}
            // Pre-cut clip: starts on the thumbnail's own frame, so there's
            // no seek and no flash of the video's opening.
            src={`/api/media-items/${item.id}/preview`}
            onCanPlay={() => setReady(true)}
            muted
            loop
            autoPlay
            playsInline
            style={{ opacity: ready ? 1 : 0, transition: "opacity 300ms ease-out" }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      ) : (
        <img
          src={`/api/media-items/${item.id}/thumbnail`}
          alt=""
          className="aspect-video w-full cursor-pointer object-cover"
        />
      )}

      <div className="space-y-2.5 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            aria-label="Play"
            tabIndex={-1}
            className="flex size-9 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105"
          >
            <Play className="size-4 translate-x-px fill-black" />
          </button>

          <button
            type="button"
            onClick={handleAdd}
            aria-label="Add to My List"
            tabIndex={-1}
            className="flex size-9 items-center justify-center rounded-full border border-white/40 text-foreground transition-colors hover:border-white"
          >
            {added ? <Check className="size-4" /> : <Plus className="size-4" />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            aria-label="More info"
            tabIndex={-1}
            className="ml-auto flex size-9 items-center justify-center rounded-full border border-white/40 text-foreground transition-colors hover:border-white"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {duration && <span className="font-medium text-foreground/80">{duration}</span>}
          {badge && (
            <span className="rounded border border-border px-1 py-px text-[10px] tracking-wide">
              {badge}
            </span>
          )}
          {item.missingSince && <span className="text-destructive">missing</span>}
        </div>

        <p className="line-clamp-1 text-xs text-muted-foreground">
          {item.tags && item.tags.length > 0
            ? item.tags.map((t) => t.name).join("  •  ")
            : item.title}
        </p>
      </div>
    </div>,
    document.body
  );
}
