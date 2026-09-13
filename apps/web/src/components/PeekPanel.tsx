import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  Heart,
  ListPlus,
  Maximize2,
  Pencil,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import {
  fetchItem,
  framingStyle,
  setWatched,
  thumbnailUrl,
  updateItem,
} from "@/lib/mediaItemApi";
import { useAppearance } from "@/lib/appearance";
import { useQueue } from "@/lib/queue";
import { useUndoable } from "@/lib/undo";
import { cn, formatDuration } from "@/lib/utils";
import { DescriptionEditor } from "./DescriptionEditor";
import { EditableTitle } from "./EditableTitle";
import { Portal } from "./Portal";
import { TagEditor } from "./TagEditor";

/** Below this, "resume" would put you back where starting over does anyway. */
const MIN_RESUMABLE_SECONDS = 15;

/**
 * Inspect an item without leaving the page (§4).
 *
 * A side panel rather than a second modal, because the point of a peek is
 * that the grid stays where it is — you glance at one item, decide, and
 * carry on down the same scroll position with the same filters. A modal
 * covers exactly the thing you are comparing against.
 *
 * It deliberately does not lock page scroll. The page underneath is still
 * usable while this is open, which is what separates a peek from the detail
 * modal; `Portal` is used only for the stacking context.
 *
 * Quick Edit (§4) is the same panel rather than a mode: title, description
 * and tags are editable in place through the components the detail modal
 * already uses, so a small correction never costs a navigation.
 */
export function PeekPanel({
  itemId,
  onClose,
  onOpenDetails,
  onPlay,
}: {
  itemId: number;
  onClose: () => void;
  /** Escalates to the full detail modal — the "Edit"/"More" exit. */
  onOpenDetails: (id: number) => void;
  onPlay: (id: number, options: { resume: boolean }) => void;
}) {
  const queryClient = useQueryClient();
  const { discreet, discreetBlurPercent } = useAppearance();
  const { add } = useQueue();
  const runUndoable = useUndoable();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const { data: item, isLoading } = useQuery({
    queryKey: ["media-item", itemId],
    queryFn: () => fetchItem(itemId),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["media-item", itemId] });
    queryClient.invalidateQueries({ queryKey: ["media-items"] });
    queryClient.invalidateQueries({ queryKey: ["continue-watching"] });
  }

  // Focus moves into the panel on open so a keyboard user is actually in it,
  // and the close button is the safe landing spot — it is the way out, and
  // reading order continues from there into the content.
  useEffect(() => {
    closeRef.current?.focus();
  }, [itemId]);

  /**
   * Escape closes, unless something is open on top of it.
   *
   * This used to require focus to be inside the panel, which was too strict
   * in a way that produced the obvious bug: clicking anywhere outside moved
   * focus to <body>, and from then on Escape did nothing at all. The panel
   * is non-modal by design — the page behind it stays usable — so focus
   * leaving it is ordinary rather than a signal that it should stop
   * listening.
   *
   * The guard it replaces asked "does the peek own the focus"; what it meant
   * to ask was "is the peek the topmost thing", and only a modal dialog or a
   * menu can be above it.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (
        document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"]')
      )
        return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /**
   * Clicking away closes it (§4).
   *
   * On mousedown rather than click, matching the appearance and filter
   * panels, so the dismissal happens as you press rather than lagging until
   * you release somewhere else.
   *
   * There is deliberately no backdrop. A backdrop would swallow the click,
   * and the point of a peek is that the grid behind it stays live — clicking
   * a different tile should reach that tile, not merely dismiss this.
   *
   * Other floating things are exempt: a toast carrying an Undo, a menu, a
   * dialog. Those sit above the page too, and clicking one is not "clicking
   * away".
   */
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (
        target.closest(
          '[role="dialog"], [role="menu"], [role="status"], [role="alert"]',
        )
      )
        return;
      onClose();
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [onClose]);

  const toggleWatched = useMutation({
    mutationFn: (next: boolean) => setWatched(itemId, next),
    onSuccess: refresh,
  });

  function toggleFavorite() {
    if (!item) return;
    const wasFavorite = item.isFavorite;
    void runUndoable({
      message: wasFavorite ? "Removed from Favourites" : "Added to Favourites",
      description: item.title,
      apply: () => updateItem(itemId, { isFavorite: !wasFavorite }),
      revert: () => updateItem(itemId, { isFavorite: wasFavorite }),
      onSettled: refresh,
    });
  }

  const progressPercent =
    item?.durationSeconds && item.lastPositionSeconds
      ? Math.min(
          100,
          Math.round((item.lastPositionSeconds / item.durationSeconds) * 100),
        )
      : null;
  const canResume =
    item?.itemType === "video" &&
    item.lastPositionSeconds > MIN_RESUMABLE_SECONDS &&
    (progressPercent ?? 0) < 97;

  return (
    <Portal lockPageScroll={false}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label={item ? `Details for ${item.title}` : "Details"}
        className="animate-slide-in-right fixed right-0 top-0 z-40 flex h-screen w-[26rem] max-w-[calc(100vw-2rem)] flex-col border-l border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Peek
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onOpenDetails(itemId)}
              aria-label="Open full details"
              title="Open full details"
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Maximize2 className="size-4" />
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close peek panel"
              title="Close (Esc)"
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {isLoading || !item ? (
          <div className="space-y-3 p-4">
            <div className="skeleton aspect-video w-full rounded-md" />
            <div className="skeleton h-5 w-2/3 rounded" />
            <div className="skeleton h-4 w-1/2 rounded" />
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="relative overflow-hidden rounded-md bg-secondary">
              <img
                src={thumbnailUrl(item)}
                alt=""
                style={{
                  ...framingStyle(item),
                  // The same privacy rule as every other surface: the panel
                  // is not an exception to Discreet Mode just because it is
                  // small (§29).
                  ...(discreet
                    ? { filter: `blur(${discreetBlurPercent / 4}px)` }
                    : undefined),
                }}
                className="aspect-video w-full object-cover"
              />
              {progressPercent !== null && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}
            </div>

            <EditableTitle
              itemId={item.id}
              title={item.title}
              className="text-lg font-semibold"
            />

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {item.studio && <span>{item.studio}</span>}
              {item.releaseDate && (
                <>
                  <span aria-hidden>·</span>
                  <span>{item.releaseDate.slice(0, 4)}</span>
                </>
              )}
              {item.durationSeconds !== null && (
                <>
                  <span aria-hidden>·</span>
                  <span>{formatDuration(item.durationSeconds)}</span>
                </>
              )}
              {progressPercent !== null && (
                <>
                  <span aria-hidden>·</span>
                  <span>{progressPercent}% watched</span>
                </>
              )}
            </div>

            {item.performers.length > 0 && (
              <p className="text-sm">
                {item.performers.map((performer) => performer.name).join(", ")}
              </p>
            )}

            {item.itemType === "video" && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onPlay(item.id, { resume: false })}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Play className="size-3.5 fill-current" />
                  {canResume ? "Start over" : "Play"}
                </button>
                {canResume && (
                  <button
                    type="button"
                    onClick={() => onPlay(item.id, { resume: true })}
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                  >
                    <RotateCcw className="size-3.5" /> Resume
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    add({
                      id: item.id,
                      title: item.title,
                      thumbnailFile: item.thumbnailFile,
                      durationSeconds: item.durationSeconds,
                    })
                  }
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                >
                  <ListPlus className="size-3.5" /> Queue
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleFavorite}
                aria-pressed={item.isFavorite}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
              >
                <Heart
                  className={cn(
                    "size-3.5",
                    item.isFavorite && "fill-red-500 text-red-500",
                  )}
                />
                {item.isFavorite ? "Favourited" : "Favourite"}
              </button>
              {item.itemType === "video" && (
                <button
                  type="button"
                  onClick={() => toggleWatched.mutate(!item.watched)}
                  aria-pressed={item.watched}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                >
                  {item.watched ? (
                    <Eye className="size-3.5" />
                  ) : (
                    <EyeOff className="size-3.5" />
                  )}
                  {item.watched ? "Watched" : "Unwatched"}
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenDetails(item.id)}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
              >
                <Pencil className="size-3.5" /> Edit
              </button>
            </div>

            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Description
              </h3>
              {/* Editable in place — the Quick Edit half of §4. */}
              <DescriptionEditor
                itemId={item.id}
                description={item.description}
              />
            </section>

            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tags
              </h3>
              <TagEditor itemId={item.id} tags={item.tags} />
            </section>
          </div>
        )}
      </div>
    </Portal>
  );
}
