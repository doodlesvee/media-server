import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Heart, Pencil, Play, Plus, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { PerformerEditor } from "./PerformerEditor";
import { DescriptionEditor } from "./DescriptionEditor";
import { EditableTitle } from "./EditableTitle";
import { FolderPicker } from "./FolderPicker";
import { RelatedItems } from "./RelatedItems";
import { StudioEditor } from "./StudioEditor";
import { TagEditor } from "./TagEditor";
import { ThumbnailPicker } from "./ThumbnailPicker";
import { TechnicalInfoPanel } from "./TechnicalInfoPanel";
import { fetchItem, savePlaybackPosition, updateItem } from "@/lib/mediaItemApi";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { addToMyList } from "@/lib/myList";
import { cn } from "@/lib/utils";

// Only offer "Continue Watching" for meaningful progress: not basically the
// start (nothing to resume) or basically the end (same as starting over).
const MIN_RESUMABLE_SECONDS = 15;

// Throttle for position saves — `timeupdate` fires several times a second.
const SAVE_INTERVAL_MS = 8000;

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
  // Metadata is read-only until you ask to edit it. Showing every editor by
  // default filled the panel with empty "Add tag…" style inputs, which read
  // as unfinished rather than as a record of the video.
  const [editing, setEditing] = useState(false);

  const toggleFavorite = useMutation({
    mutationFn: (next: boolean) => updateItem(viewingId, { isFavorite: next }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-item", viewingId] });
      queryClient.invalidateQueries({ queryKey: ["media-items"] });
    },
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startPosition = useRef(0);
  const lastSavedAt = useRef(0);
  const autoPlayTriggered = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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

    // The preview clip already starts where it should, so only real playback
    // needs to seek (and stays hidden until that seek lands).
    if (mode === "playing") {
      video.currentTime = startPosition.current;
      return; // revealed by onSeeked
    }
    setSeeked(true);
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
    // Reset so a finished video doesn't linger as "Continue Watching".
    void savePlaybackPosition(item.id, 0);
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
    <div
      ref={scrollRef}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="mx-auto w-full max-w-5xl overflow-hidden rounded-xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Backdrop / player area */}
        <div className="relative aspect-video w-full bg-black">
          {item?.itemType === "video" && (
            <img
              src={thumbnailUrl(item)}
              alt=""
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
              muted={mode === "preview"}
              autoPlay
              loop={mode === "preview"}
              playsInline
              controls={mode === "playing"}
              style={{ opacity: seeked ? 1 : 0, transition: "opacity 300ms ease-out" }}
              className="absolute inset-0 h-full w-full object-cover"
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
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Performers
                </span>
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
              {editing && (
                <div className="space-y-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Thumbnail
                  </span>
                  <ThumbnailPicker itemId={item.id} hasCustom={item.thumbnailFile !== null} />
                </div>
              )}

              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Studio
                </span>
                <StudioEditor itemId={item.id} studio={item.studio} readOnly={!editing} />
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tags
                </span>
                <TagEditor itemId={item.id} tags={item.tags} readOnly={!editing} />
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Details
                </span>
                <TechnicalInfoPanel item={item} />
              </div>

              {editing && <FolderPicker itemId={item.id} parentId={item.parentId} />}
            </div>
          </div>
        )}

        {item && <RelatedItems itemId={item.id} onSelect={openRelated} />}
      </div>
    </div>
  );
}
