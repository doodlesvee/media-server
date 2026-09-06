import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Eye,
  EyeOff,
  Gauge,
  Heart,
  Maximize,
  Move,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { PerformerEditor } from "./PerformerEditor";
import { DescriptionEditor } from "./DescriptionEditor";
import { EditableTitle } from "./EditableTitle";
import { FolderPicker } from "./FolderPicker";
import { GalleryStrip } from "./GalleryStrip";
import { Portal } from "./Portal";
import { RelatedItems } from "./RelatedItems";
import { StudioEditor } from "./StudioEditor";
import { TagEditor } from "./TagEditor";
import { TechnicalInfoPanel } from "./TechnicalInfoPanel";
import { ThumbnailPicker } from "./ThumbnailPicker";
import { FramingEditor, type FramingValue } from "./FramingEditor";
import { useAccentColor } from "@/lib/dominantColor";
import { fetchCategories } from "@/lib/categoryApi";
import { fetchItem, savePlaybackPosition, setWatched, updateItem } from "@/lib/mediaItemApi";
import {
  PLAYBACK_RATES,
  readRate,
  readVolume,
  writeRate,
  writeVolume,
} from "@/lib/playerPrefs";
import { framingStyle, thumbnailUrl } from "@/lib/mediaItemApi";
import { addToMyList } from "@/lib/myList";
import { cn } from "@/lib/utils";

// Only offer "Continue Watching" for meaningful progress: not basically the
// start (nothing to resume) or basically the end (same as starting over).
const MIN_RESUMABLE_SECONDS = 15;

function FieldLabel({ children, accent }: { children: React.ReactNode; accent?: string | null }) {
  return (
    <span
      className="block text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors duration-500"
      style={{ color: accent ?? undefined }}
    >
      {children}
    </span>
  );
}

// Throttle for position saves — `timeupdate` fires several times a second.
const SAVE_INTERVAL_MS = 8000;

/** How far the arrow keys and the skip buttons jump. */
const SKIP_SECONDS = 10;

/**
 * Whether a keystroke belongs to something the user is typing into.
 *
 * The header search box sits on the page behind the modal, and the title,
 * description, tag, performer and studio editors all render inside it — so
 * without this, typing a space into any of them would pause the video
 * instead of typing a space.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches("input, textarea, select, [contenteditable], [contenteditable=true]");
}

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

export function MediaDetailModal({
  itemId,
  autoPlay = false,
  onClose,
}: {
  itemId: number;
  autoPlay?: boolean;
  onClose: () => void;
}) {
  // Clicking a "More Like This" card swaps the modal's content in place
  // rather than stacking modals or bouncing back to the grid.
  const [viewingId, setViewingId] = useState(itemId);
  const panelRef = useRef<HTMLDivElement>(null);

  // Without this, focus stays on the page behind: Tab walks the background
  // instead of the dialog, and closing leaves focus nowhere useful.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);
  useEffect(() => setViewingId(itemId), [itemId]);

  const { data: item } = useQuery({
    queryKey: ["media-item", viewingId],
    queryFn: () => fetchItem(viewingId),
  });

  const [mode, setMode] = useState<"preview" | "playing">("preview");
  const [addedToList, setAddedToList] = useState(false);
  const [seeked, setSeeked] = useState(false);
  const queryClient = useQueryClient();
  const [muted, setMuted] = useState(true);
  // Read once on mount rather than on every render — these are re-applied to
  // the element imperatively, so React never needs to re-render for them.
  const [rate, setRate] = useState(readRate);
  const [showRates, setShowRates] = useState(false);
  const [reframing, setReframing] = useState(false);
  const volumeRef = useRef(readVolume());
  // Metadata is read-only until you ask to edit it. Showing every editor by
  // default filled the panel with empty "Add tag…" style inputs, which read
  // as unfinished rather than as a record of the video.
  const [editing, setEditing] = useState(false);

  const { data: categoryData } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
  const categories = categoryData?.categories ?? [];
  const accent = useAccentColor(item ? thumbnailUrl(item) : null);

  const updateKind = useMutation({
    mutationFn: (kind: string) => updateItem(viewingId, { kind }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-item", viewingId] });
      queryClient.invalidateQueries({ queryKey: ["media-items"] });
      // The home page tiles show per-category counts, and they read
      // ["categories"] — invalidating ["kinds"] refreshed nothing, since no
      // component has used that key since categories became editable data.
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: (next: boolean) => updateItem(viewingId, { isFavorite: next }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-item", viewingId] });
      queryClient.invalidateQueries({ queryKey: ["media-items"] });
    },
  });
  const saveFraming = useMutation({
    mutationFn: (next: FramingValue) =>
      updateItem(viewingId, {
        thumbnailPositionX: next.x,
        thumbnailPositionY: next.y,
        thumbnailScale: next.scale,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-item", viewingId] });
      // Every surface showing this thumbnail has to repaint, not just the modal.
      queryClient.invalidateQueries({ queryKey: ["media-items"] });
      queryClient.invalidateQueries({ queryKey: ["hero-items"] });
      queryClient.invalidateQueries({ queryKey: ["continue-watching"] });
      setReframing(false);
    },
  });

  const toggleWatched = useMutation({
    mutationFn: (next: boolean) => setWatched(viewingId, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-item", viewingId] });
      queryClient.invalidateQueries({ queryKey: ["media-items"] });
      // Marking something watched is exactly what should drop it out of
      // Continue Watching, so that row has to refetch.
      queryClient.invalidateQueries({ queryKey: ["continue-watching"] });
    },
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startPosition = useRef(0);
  const lastSavedAt = useRef(0);
  const autoPlayTriggered = useRef(false);

  function skip(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    const limit = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.min(limit, Math.max(0, video.currentTime + seconds));
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  }

  function applyRate(next: number) {
    setRate(next);
    writeRate(next);
    setShowRates(false);
    if (videoRef.current) videoRef.current.playbackRate = next;
  }

  function nudgeVolume(delta: number) {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.min(1, Math.max(0, video.volume + delta));
    video.volume = next;
    volumeRef.current = next;
    writeVolume(next);
    // Raising the volume on a muted video should actually be audible.
    if (next > 0 && video.muted) {
      video.muted = false;
      setMuted(false);
    }
  }

  function toggleFullscreen() {
    const video = videoRef.current;
    if (!video) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void video.requestFullscreen?.().catch(() => {});
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Escape closes even from inside an input — it's the way out of a
      // field you opened by accident.
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (isTypingTarget(e.target)) return;
      // Every shortcut below drives the video, so there's nothing to do
      // while the muted preview is showing.
      if (mode !== "playing") return;

      // The browser's own controls already handle arrows and space once the
      // video itself has focus. Handling them again here would seek twice
      // per press.
      if (e.target === videoRef.current && e.key !== "f" && e.key !== "m") return;

      switch (e.key) {
        case " ":
        case "k":
          // Space also scrolls this modal's overflow container and re-clicks
          // whichever button was last focused — the modal is full of them.
          e.preventDefault();
          if (e.target instanceof HTMLElement) e.target.blur();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skip(-SKIP_SECONDS);
          break;
        case "ArrowRight":
          e.preventDefault();
          skip(SKIP_SECONDS);
          break;
        case "ArrowUp":
          e.preventDefault();
          nudgeVolume(0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          nudgeVolume(-0.1);
          break;
        case "f":
          toggleFullscreen();
          break;
        case "m":
          toggleMuted();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, mode]);

  function startPlaying(positionSeconds: number) {
    startPosition.current = positionSeconds;
    setMode("playing");
    setMuted(false);

    const video = videoRef.current;
    if (video) {
      video.currentTime = positionSeconds;
      video.muted = false;
      void video.play().catch(() => {});
    }
  }

  // Hero "Play" arrives with autoPlay set — skip the muted preview entirely.
  useEffect(() => {
    if (autoPlay && item?.itemType === "video" && !autoPlayTriggered.current) {
      autoPlayTriggered.current = true;
      startPlaying(0);
    }
  }, [autoPlay, item]);

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video || !item) return;

    // `key={mode}` mounts a brand-new element when the preview gives way to
    // real playback, so anything set imperatively is gone by this point.
    // Re-applying here is what makes volume and speed survive that swap —
    // and carry over to the next video you open.
    video.volume = volumeRef.current;
    video.playbackRate = rate;

    // The preview clip already starts where it should, so only real playback
    // needs to seek (and stays hidden until that seek lands).
    if (mode === "playing") {
      video.currentTime = startPosition.current;
      return; // revealed by onSeeked
    }
    setSeeked(true);
  }

  // The native controls have their own volume slider, so the element is the
  // source of truth — this just records what it settles on.
  function handleVolumeChange() {
    const video = videoRef.current;
    if (!video || mode !== "playing") return;
    if (video.volume !== volumeRef.current) {
      volumeRef.current = video.volume;
      writeVolume(video.volume);
    }
    setMuted(video.muted);
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    // Critical: only real playback counts as progress. Saving during the
    // muted background preview would clobber the actual resume position
    // with wherever the preview happens to be.
    if (!video || !item || mode !== "playing") return;

    const now = Date.now();
    if (now - lastSavedAt.current > SAVE_INTERVAL_MS) {
      lastSavedAt.current = now;
      void savePlaybackPosition(item.id, Math.floor(video.currentTime));
    }
  }

  function handlePause() {
    const video = videoRef.current;
    if (!item || !video || mode !== "playing") return;
    void savePlaybackPosition(item.id, Math.floor(video.currentTime));
  }

  function handleEnded() {
    if (!item || mode !== "playing") return;
    // Marking it watched both resets the position and takes it out of
    // Continue Watching — which a bare position reset never did, since that
    // row only ever filtered on having *some* progress.
    toggleWatched.mutate(true);
  }

  async function handleAddToList() {
    if (!item) return;
    await addToMyList(item.id);
    setAddedToList(true);
    void queryClient.invalidateQueries({ queryKey: ["collections"] });
    void queryClient.invalidateQueries({ queryKey: ["collection-items"] });
  }

  function toggleMuted() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  function openRelated(id: number) {
    setViewingId(id);
    // Reset back to the muted preview for the newly-shown item rather than
    // inheriting the previous one's playing state.
    setMode("preview");
    setEditing(false);
    setMuted(true);
    setReframing(false);
    setAddedToList(false);
    setSeeked(false);
    lastSavedAt.current = 0;
    scrollRef.current?.scrollTo({ top: 0 });
  }

  const canResume =
    !!item &&
    item.lastPositionSeconds > MIN_RESUMABLE_SECONDS &&
    (item.durationSeconds == null ||
      item.lastPositionSeconds < item.durationSeconds - MIN_RESUMABLE_SECONDS);

  return (
    <Portal>
      <div
        ref={scrollRef}
        // overscroll-contain stops the scroll continuing into the page
        // behind once this container hits its end.
        className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/80 p-4 backdrop-blur-sm sm:p-8"
        onClick={onClose}
      >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="relative mx-auto w-full max-w-5xl animate-fade-up overflow-hidden rounded-xl bg-card shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Backdrop / player area */}
        <div className="relative aspect-video w-full overflow-hidden bg-black">
          {item?.itemType === "video" && (
            <img
              src={thumbnailUrl(item)}
              alt=""
              // Fades out once real playback is actually on screen. It fills
              // the frame (object-cover) while the video letterboxes inside it
              // (object-contain), so for anything not exactly 16:9 the poster
              // stayed visible down the sides — a bright one reads as a white
              // border rather than as bars. Kept until the seek lands, which
              // is what stops the frame flashing black while the stream
              // buffers.
              style={{
                ...framingStyle(item),
                opacity: mode === "playing" && seeked ? 0 : 1,
                transition: "opacity 300ms ease-out",
              }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {item?.itemType === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- no sidecar subtitles yet
            <video
              ref={videoRef}
              // Preview mode plays the pre-cut clip (instant, already at the
              // poster frame); real playback streams the full file.
              key={mode}
              src={
                mode === "playing"
                  ? `/api/stream/${item.id}`
                  : `/api/media-items/${item.id}/preview`
              }
              poster={thumbnailUrl(item)}
              onLoadedMetadata={handleLoadedMetadata}
              onSeeked={() => setSeeked(true)}
              onTimeUpdate={handleTimeUpdate}
              onPause={handlePause}
              onEnded={handleEnded}
              onVolumeChange={handleVolumeChange}
              muted={mode === "preview"}
              autoPlay
              loop={mode === "preview"}
              playsInline
              controls={mode === "playing"}
              style={{ opacity: seeked ? 1 : 0, transition: "opacity 300ms ease-out" }}
              className={cn(
                "absolute inset-0 h-full w-full",
                // The preview is deliberately cropped to fill the frame, but
                // cropping actual playback cuts the sides off anything that
                // isn't 16:9 — letterbox it instead.
                mode === "playing" ? "object-contain" : "object-cover"
              )}
            />
          ) : item ? (
            <img
              src={`/api/stream/${item.id}`}
              alt={item.title}
              className="h-full w-full object-contain"
            />
          ) : null}

          {/* Gradient + overlaid title/actions, hidden once real playback
              starts so they don't sit on top of the video controls. */}
          {mode === "preview" && (
            <>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />

              <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-4 p-6">
                <h2 className="max-w-2xl text-2xl font-bold tracking-tight drop-shadow-md sm:text-3xl">
                  {item?.title ?? "Loading…"}
                </h2>

                {item?.itemType === "video" && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => startPlaying(0)}
                      className="flex items-center gap-2 rounded-md bg-white px-5 py-2 font-semibold text-black transition-transform hover:scale-[1.03]"
                    >
                      <RotateCcw className="size-5" />
                      Start Over
                    </button>
                    {canResume && (
                      <button
                        type="button"
                        onClick={() => startPlaying(item.lastPositionSeconds)}
                        className="flex items-center gap-2 rounded-md bg-white/20 px-5 py-2 font-semibold backdrop-blur-sm transition-colors hover:bg-white/30"
                      >
                        <Play className="size-5 fill-current" />
                        Continue Watching
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleFavorite.mutate(!item.isFavorite)}
                      disabled={toggleFavorite.isPending}
                      aria-pressed={item.isFavorite}
                      aria-label={item.isFavorite ? "Remove from favourites" : "Mark as favourite"}
                      title={item.isFavorite ? "Favourited" : "Mark as favourite"}
                      className="flex size-10 items-center justify-center rounded-full border border-white/40 backdrop-blur-sm transition-colors hover:border-white disabled:opacity-50"
                    >
                      <Heart
                        className={cn(
                          "size-5 transition-colors",
                          item.isFavorite && "fill-red-500 text-red-500"
                        )}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleWatched.mutate(!item.watched)}
                      disabled={toggleWatched.isPending}
                      aria-pressed={item.watched}
                      aria-label={item.watched ? "Mark as unwatched" : "Mark as watched"}
                      title={item.watched ? "Watched — click to unmark" : "Mark as watched"}
                      className="flex size-10 items-center justify-center rounded-full border border-white/40 backdrop-blur-sm transition-colors hover:border-white disabled:opacity-50"
                    >
                      {item.watched ? (
                        <Eye className="size-5 text-emerald-400" />
                      ) : (
                        <EyeOff className="size-5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddToList}
                      aria-label="Add to My List"
                      className="flex size-10 items-center justify-center rounded-full border border-white/40 backdrop-blur-sm transition-colors hover:border-white"
                    >
                      {addedToList ? <Check className="size-5" /> : <Plus className="size-5" />}
                    </button>
                  </div>
                )}
              </div>

              {item?.itemType === "video" && (
                <button
                  type="button"
                  onClick={toggleMuted}
                  aria-label={muted ? "Unmute" : "Mute"}
                  className="absolute bottom-6 right-6 flex size-10 items-center justify-center rounded-full border border-white/40 bg-black/40 backdrop-blur-sm hover:bg-black/60"
                >
                  {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </button>
              )}
            </>
          )}

          {/* Sits above the native control bar rather than replacing it —
              the browser's scrubber and fullscreen already work, these are
              only the pieces it doesn't offer. */}
          {mode === "playing" && item?.itemType === "video" && (
            <div className="absolute left-4 top-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => skip(-SKIP_SECONDS)}
                aria-label={`Back ${SKIP_SECONDS} seconds`}
                title={`Back ${SKIP_SECONDS}s (←)`}
                className="flex size-9 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-colors hover:bg-black/80"
              >
                <RotateCcw className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => skip(SKIP_SECONDS)}
                aria-label={`Forward ${SKIP_SECONDS} seconds`}
                title={`Forward ${SKIP_SECONDS}s (→)`}
                className="flex size-9 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-colors hover:bg-black/80"
              >
                <RotateCw className="size-4" />
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowRates((v) => !v)}
                  aria-label="Playback speed"
                  aria-expanded={showRates}
                  title="Playback speed"
                  className="flex h-9 items-center gap-1.5 rounded-full bg-black/60 px-3 text-xs font-medium backdrop-blur-sm transition-colors hover:bg-black/80"
                >
                  <Gauge className="size-4" />
                  {rate}×
                </button>
                {showRates && (
                  <div className="absolute left-0 top-11 z-10 flex flex-col overflow-hidden rounded-md bg-black/90 py-1 backdrop-blur-sm">
                    {PLAYBACK_RATES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => applyRate(option)}
                        className={cn(
                          "px-4 py-1.5 text-left text-xs transition-colors hover:bg-white/15",
                          option === rate && "font-semibold text-white"
                        )}
                      >
                        {option}×
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label="Fullscreen"
                title="Fullscreen (f)"
                className="flex size-9 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-colors hover:bg-black/80"
              >
                <Maximize className="size-4" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-colors hover:bg-black/80"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Details */}
        {item && (
          <div className="grid gap-6 p-6 sm:grid-cols-[1.6fr_1fr]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{new Date(item.createdAt).getFullYear()}</span>
                {item.durationSeconds !== null && (
                  <>
                    <span>·</span>
                    <span>{formatDuration(item.durationSeconds)}</span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setEditing((e) => !e)}
                  aria-pressed={editing}
                  aria-label={editing ? "Finish editing details" : "Edit details"}
                  title={editing ? "Done editing" : "Edit details"}
                  className={cn(
                    "ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                    editing
                      ? "bg-white text-black hover:bg-white/90"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
                  {editing ? "Done" : "Edit"}
                </button>
              </div>

              {editing ? (
                <>
                  <EditableTitle
                    itemId={item.id}
                    title={item.title}
                    className="cursor-text text-lg font-bold hover:underline"
                  />
                  <DescriptionEditor itemId={item.id} description={item.description} />
                </>
              ) : (
                <>
                  <h2 className="text-lg font-bold">{item.title}</h2>
                  {item.description && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                </>
              )}

              <div className="space-y-1.5 pt-1">
                <FieldLabel accent={accent}>Performers</FieldLabel>
                <PerformerEditor
                  itemId={item.id}
                  performers={item.performers}
                  source={item.performersSource}
                  readOnly={!editing}
                />
              </div>

              {item.playbackWarning && (
                <p className="rounded-md bg-yellow-500/15 px-3 py-2 text-sm text-yellow-500">
                  {item.playbackWarning}
                </p>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <FieldLabel accent={accent}>Category</FieldLabel>
                {editing ? (
                  <select
                    value={item.kind}
                    onChange={(e) => updateKind.mutate(e.target.value)}
                    disabled={updateKind.isPending}
                    className="w-full rounded-md border border-border bg-secondary/60 px-2 py-1.5 text-sm outline-none focus:border-ring/60 disabled:opacity-50"
                  >
                    {categories.map((category) => (
                      <option key={category.slug} value={category.slug}>
                        {category.label}
                      </option>
                    ))}
                    {/* An item can hold a slug whose category was deleted;
                        without this the select would silently show the first
                        option and misrepresent what's stored. */}
                    {!categories.some((c) => c.slug === item.kind) && (
                      <option value={item.kind}>{item.kind}</option>
                    )}
                  </select>
                ) : (
                  <span
                    className="text-sm font-medium transition-colors duration-500"
                    style={{ color: accent ?? undefined }}
                  >
                    {categories.find((c) => c.slug === item.kind)?.label ?? item.kind}
                  </span>
                )}
              </div>

              {editing && (
                <div className="space-y-1.5">
                  <FieldLabel accent={accent}>Thumbnail</FieldLabel>
                  <ThumbnailPicker
                    itemId={item.id}
                    hasCustom={item.thumbnailFile !== null}
                    onUploaded={() => setReframing(true)}
                  />

                  {reframing ? (
                    <FramingEditor
                      src={thumbnailUrl(item)}
                      value={{
                        x: item.thumbnailPositionX,
                        y: item.thumbnailPositionY,
                        scale: item.thumbnailScale,
                      }}
                      // Previewed at the tile's shape, which is also the hover
                      // card's and the modal backdrop's. The hero crops the
                      // same image far wider, so the note below warns that the
                      // choice shows up there too.
                      aspectClass="aspect-video"
                      saving={saveFraming.isPending}
                      onSave={(next) => saveFraming.mutate(next)}
                      onCancel={() => setReframing(false)}
                      note="Used everywhere this image appears — tile, hover card and the hero banner, which crops it much wider."
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReframing(true)}
                      className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-xs transition-colors hover:bg-accent"
                    >
                      <Move className="size-3.5" />
                      Reposition
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <FieldLabel accent={accent}>Studio</FieldLabel>
                <StudioEditor itemId={item.id} studio={item.studio} readOnly={!editing} />
              </div>

              <div className="space-y-1.5">
                <FieldLabel accent={accent}>Tags</FieldLabel>
                <TagEditor itemId={item.id} tags={item.tags} readOnly={!editing} accent={accent} />
              </div>

              <div className="space-y-1.5">
                <FieldLabel accent={accent}>Details</FieldLabel>
                <TechnicalInfoPanel item={item} />
              </div>

              {editing && <FolderPicker itemId={item.id} parentId={item.parentId} />}
            </div>
          </div>
        )}

        {/* Above "More like this": the gallery belongs to this video, while
            related items lead away from it. */}
        {item && <GalleryStrip itemId={item.id} />}

          {item && <RelatedItems itemId={item.id} onSelect={openRelated} />}
        </div>
      </div>
    </Portal>
  );
}
