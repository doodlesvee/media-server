import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Film, Folder, Image as ImageIcon } from "lucide-react";
import { framingStyle, thumbnailUrl } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";
import { HoverPreviewCard } from "./HoverPreviewCard";

export type MediaCardItem = {
  id: number;
  itemType: "video" | "photo" | "folder";
  title: string;
  durationSeconds: number | null;
  missingSince: string | null;
  lastPositionSeconds?: number;
  thumbnailFile?: string | null;
  /** Framing chosen in the detail modal; defaults mean "untouched". */
  thumbnailPositionX?: number;
  thumbnailPositionY?: number;
  thumbnailScale?: number;
  description?: string | null;
  tags?: { id: number; name: string }[];
  performers?: { id: number; name: string }[];
  studio?: string | null;
  extraMetadata?: { width?: number; height?: number; codec?: string } | null;
};

// Dwell time before the expanded hover card appears, so sweeping the mouse
// across a row doesn't pop a card open (and start a stream) for every item.
const HOVER_DELAY_MS = 450;

export function MediaCard({
  item,
  onClick,
  onPlay,
  selectable = false,
  selected = false,
  className,
}: {
  item: MediaCardItem;
  onClick: () => void;
  onPlay?: () => void;
  selectable?: boolean;
  selected?: boolean;
  className?: string;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLButtonElement>(null);

  const showImage = item.itemType !== "folder" && !thumbFailed;
  const canExpand = !selectable && item.itemType !== "folder";

  const progressPercent =
    item.lastPositionSeconds && item.durationSeconds
      ? Math.min(100, Math.round((item.lastPositionSeconds / item.durationSeconds) * 100))
      : null;

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  function expand() {
    if (cardRef.current) setAnchorRect(cardRef.current.getBoundingClientRect());
  }

  function handleMouseEnter() {
    if (!canExpand) return;
    hoverTimer.current = setTimeout(expand, HOVER_DELAY_MS);
  }

  // Keyboard focus expands immediately — a dwell delay only makes sense for
  // a mouse sweeping across a row, and waiting after a deliberate Tab would
  // just feel broken.
  function handleFocus() {
    if (canExpand) expand();
  }

  function cancelHover() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  /**
   * Opening the detail modal must also tear down the hover card.
   *
   * The hover card only dismissed on its own mouseleave — but the modal
   * covers it, so the pointer never leaves and it stayed sitting underneath.
   * Both entry points (the tile, and the buttons on the expanded card) go
   * through here.
   */
  function openItem(action: () => void) {
    cancelHover();
    setAnchorRect(null);
    action();
  }

  return (
    <>
      <button
        ref={cardRef}
        type="button"
        onClick={() => openItem(onClick)}
        onMouseEnter={handleMouseEnter}
        // The expanded card overlays this one, so only cancel a *pending*
        // hover here — dismissing the open card is its own mouseleave.
        onMouseLeave={cancelHover}
        onFocus={handleFocus}
        onBlur={() => {
          cancelHover();
          setAnchorRect(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAnchorRect(null);
        }}
        className={cn(
          "group relative w-full shrink-0 rounded-md text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          className
        )}
      >
        <div
          className={cn(
            "relative aspect-video w-full overflow-hidden rounded-md bg-secondary ring-1 ring-border transition-all duration-200",
            !selectable && "group-hover:ring-white/40",
            selected && "ring-2 ring-primary",
            item.missingSince && "opacity-50"
          )}
        >
          {showImage ? (
            <img
              src={thumbnailUrl(item)}
              style={framingStyle(item)}
              alt=""
              onError={() => setThumbFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {item.itemType === "folder" ? (
                <Folder className="size-8 text-muted-foreground" />
              ) : item.itemType === "video" ? (
                <Film className="size-8 text-muted-foreground" />
              ) : (
                <ImageIcon className="size-8 text-muted-foreground" />
              )}
            </div>
          )}

          {item.missingSince && (
            <span className="absolute left-1 top-1 rounded bg-destructive/90 px-1.5 py-0.5 text-[10px] text-white">
              missing
            </span>
          )}

          {selectable && (
            <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-0.5">
              {selected ? (
                <CheckCircle2 className="size-5 text-primary" />
              ) : (
                <Circle className="size-5 text-white/80" />
              )}
            </span>
          )}

          {/* Sits before the progress bar in the DOM so that 1px line still
              paints on top of the gradient rather than under it. */}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-2.5 pb-2 pt-8">
            {item.performers && item.performers.length > 0 && (
              // One line only: with the title clamped to two below it, a
              // wrapping cast list would push the title off the tile.
              <span className="block truncate text-[10px] font-medium uppercase tracking-wide text-white/70">
                {item.performers.map((p) => p.name).join(", ")}
              </span>
            )}
            <span className="line-clamp-2 text-xs font-medium leading-snug text-white drop-shadow">
              {item.title}
            </span>
          </span>

          {progressPercent !== null && (
            <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
              <span className="block h-full bg-white" style={{ width: `${progressPercent}%` }} />
            </span>
          )}
        </div>

      </button>

      {anchorRect && (
        <HoverPreviewCard
          item={item}
          anchorRect={anchorRect}
          onOpen={() => openItem(onClick)}
          onPlay={() => openItem(onPlay ?? onClick)}
          onDismiss={() => setAnchorRect(null)}
        />
      )}
    </>
  );
}
