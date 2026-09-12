import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Film,
  Folder,
  Image as ImageIcon,
  Pin,
} from "lucide-react";
import { framingStyle, thumbnailUrl } from "@/lib/mediaItemApi";
import { useAppearance } from "@/lib/appearance";
import { cardChrome } from "@/lib/layout";
import { worthExpanding } from "@/lib/hoverCard";
import { cn } from "@/lib/utils";
import { HoverPreviewCard } from "./HoverPreviewCard";
import { isPinned, togglePin } from "@/lib/pinned";

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
  tabIndex,
  gridIndex,
}: {
  item: MediaCardItem;
  onClick: () => void;
  onPlay?: () => void;
  selectable?: boolean;
  selected?: boolean;
  className?: string;
  /**
   * Set by a virtualized grid running a roving tab stop, so Tab enters the
   * grid once and the arrow keys move within it. Left undefined elsewhere,
   * where every card being a tab stop is the right behaviour.
   */
  tabIndex?: number;
  /** Flat position in that grid, so it can find this card to focus it. */
  gridIndex?: number;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLButtonElement>(null);

  const {
    hoverZoom,
    hoverPreview,
    discreet,
    tileInfo: tileInfoSetting,
    density,
  } = useAppearance();
  // Density decides how tightly the text sits in the frame. The card's width
  // is the grid's business, so nothing here depends on the view mode.
  const chrome = cardChrome(density, tileInfoSetting);
  const tileInfo = chrome.tileInfo;
  const [previewing, setPreviewing] = useState(false);
  const [pinned, setPinned] = useState(
    () => item.itemType === "folder" && isPinned(`folder:${item.id}`),
  );

  const showImage = item.itemType !== "folder" && !thumbFailed;
  // Turned off in the Appearance panel, a tile stays a tile — it still opens,
  // it just never grows into a preview card under the pointer.
  const canExpand = hoverZoom && !selectable && item.itemType !== "folder";
  // With the zoom off there is no expanded card for the clip to play in, so
  // it plays in the tile itself instead. Otherwise turning the zoom off would
  // silently take the preview with it, which is two settings behaving as one.
  // Never while discreet: a blurred still is quiet, but movement under the
  // pointer is the thing someone across the room actually notices.
  const canPreviewInline =
    hoverPreview &&
    !discreet &&
    !hoverZoom &&
    !selectable &&
    item.itemType === "video";

  const progressPercent =
    item.lastPositionSeconds && item.durationSeconds
      ? Math.min(
          100,
          Math.round((item.lastPositionSeconds / item.durationSeconds) * 100),
        )
      : null;

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  function expand() {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    // A big tile falls back to playing the clip in place, which is what the
    // zoom-off path already does — so turning out to be too large costs you
    // the growth animation, not the preview.
    if (!worthExpanding(rect.width, window.innerWidth)) {
      if (hoverPreview && !discreet && item.itemType === "video") {
        setPreviewing(true);
      }
      return;
    }
    setAnchorRect(rect);
  }

  function handleMouseEnter() {
    // The same dwell delay either way: sweeping the pointer along a row
    // shouldn't start a dozen clip downloads any more than it should throw up
    // a dozen cards.
    if (canExpand) hoverTimer.current = setTimeout(expand, HOVER_DELAY_MS);
    else if (canPreviewInline)
      hoverTimer.current = setTimeout(
        () => setPreviewing(true),
        HOVER_DELAY_MS,
      );
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
    // Unmounts the clip rather than pausing it, so leaving a tile actually
    // stops the download instead of leaving it buffering off-screen.
    setPreviewing(false);
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
        tabIndex={tabIndex}
        data-grid-index={gridIndex}
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
          "motion-card group relative w-full shrink-0 rounded-md text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          className,
        )}
      >
        <div
          className={cn(
            // 16:10 rather than 16:9. The frames themselves are widescreen, so this
            // crops a sliver off each side — the tile reads as slightly taller
            // without the artwork losing anything that matters.
            // 16:10 rather than 16:9. The frames themselves are widescreen, so this
            // crops a sliver off each side — the tile reads as slightly taller
            // without the artwork losing anything that matters.
            "relative w-full overflow-hidden rounded-md bg-secondary ring-1 ring-border transition-all duration-200",
            !selectable && "group-hover:ring-white/40",
            selected && "ring-2 ring-primary",
            item.missingSince && "opacity-50",
          )}
          style={{ aspectRatio: chrome.aspectRatio }}
        >
          {showImage ? (
            <>
              <img
                src={thumbnailUrl(item)}
                style={framingStyle(item)}
                alt=""
                // The grid can hold thousands of these. Off-screen tiles cost
                // nothing until they're scrolled near, and decoding off the
                // main thread keeps a fast scroll from stuttering. Safe
                // against layout shift: the frame is already sized, so the
                // image never decides the tile's geometry.
                loading="lazy"
                decoding="async"
                onError={() => setThumbFailed(true)}
                className="h-full w-full object-cover"
              />
              {previewing && (
                // Over the thumbnail rather than replacing it: the clip fades
                // in only once it can play, so the tile never blinks to black
                // while it buffers.
                /* eslint-disable-next-line jsx-a11y/media-has-caption -- silent hover preview */
                <video
                  src={`/api/media-items/${item.id}/preview`}
                  onCanPlay={(event) =>
                    (event.currentTarget.style.opacity = "1")
                  }
                  muted
                  loop
                  autoPlay
                  playsInline
                  style={{ opacity: 0, transition: "opacity 300ms ease-out" }}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </>
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

          {item.itemType === "folder" && (
            <span className="absolute left-1.5 top-1.5 z-10">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  togglePin({
                    id: `folder:${item.id}`,
                    type: "folder",
                    label: item.title,
                    folderId: item.id,
                  });
                  setPinned((value) => !value);
                }}
                aria-pressed={pinned}
                aria-label={
                  pinned ? `Unpin ${item.title}` : `Pin ${item.title}`
                }
                title={pinned ? "Unpin folder" : "Pin folder"}
                className="flex size-7 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20"
              >
                <Pin className={cn("size-3.5", pinned && "fill-white")} />
              </button>
            </span>
          )}

          {/* Sits before the progress bar in the DOM so that 1px line still
              paints on top of the gradient rather than under it.

              The gradient goes with the text: on "None" it would be a dark
              band over the bottom third of a picture with nothing written on
              it. The progress bar and the watched tick stay in every mode —
              they're state, not a label, and losing track of what you'd
              already started would be a real cost rather than less clutter. */}
          {tileInfo !== "none" && (
            <span
              className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-8"
              style={{
                paddingLeft: chrome.paddingPx,
                paddingRight: chrome.paddingPx,
                paddingBottom: Math.max(2, chrome.paddingPx - 2),
              }}
            >
              {tileInfo === "full" &&
                item.performers &&
                item.performers.length > 0 && (
                  // One line only: with the title clamped to two below it, a
                  // wrapping cast list would push the title off the tile.
                  <span className="sensitive block truncate text-[10px] font-medium uppercase tracking-wide text-white/70">
                    {item.performers.map((p) => p.name).join(", ")}
                  </span>
                )}
              <span className="sensitive line-clamp-2 text-xs font-medium leading-snug text-white drop-shadow">
                {item.title}
              </span>
            </span>
          )}

          {progressPercent !== null && (
            <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
              <span
                className="block h-full bg-white"
                style={{ width: `${progressPercent}%` }}
              />
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
