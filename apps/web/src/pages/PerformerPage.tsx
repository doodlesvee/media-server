import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { FramingEditor, type FramingValue } from "@/components/FramingEditor";
import { getRouteApi } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MediaDetailModal } from "@/components/MediaDetailModal";
import { PerformerContinueWatching } from "@/components/PerformerContinueWatching";
import { AlbumRow } from "@/components/AlbumRow";
import { PerformerCoPerformers } from "@/components/PerformerCoPerformers";
import { PerformerStats } from "@/components/PerformerStats";
import { PerformerVideos } from "@/components/PerformerVideos";
import { PerformerBanner } from "@/components/PerformerBanner";
import { PerformerBio } from "@/components/PerformerBio";
import { PerformerImageMenu } from "@/components/PerformerImageMenu";
import { PerformerImagePicker } from "@/components/PerformerImagePicker";
import {
  fetchPerformer,
  performerImageUrl,
  performerPortraitUrl,
  portraitStyle,
  savePortraitFraming,
  setPerformerFavorite,
} from "@/lib/performerApi";

const routeApi = getRouteApi("/performer/$performerId");

export function PerformerPage() {
  const { performerId } = routeApi.useParams();
  const id = Number(performerId);
  const [reframing, setReframing] = useState(false);
  // Opening a video from here shows the modal in place, rather than
  // navigating away and losing your position on the profile.
  const [open, setOpen] = useState<{ id: number; autoPlay: boolean } | null>(null);
  const openItem = (id: number, autoPlay: boolean) => setOpen({ id, autoPlay });
  const [bannerEditRequest, setBannerEditRequest] = useState(0);
  const queryClient = useQueryClient();

  const saveFraming = useMutation({
    mutationFn: (next: FramingValue) =>
      savePortraitFraming(id, {
        imagePositionX: next.x,
        imagePositionY: next.y,
        imageScale: next.scale,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performer", id] });
      // The cards on the performers page and the home row show the same
      // portrait, so they have to repaint too.
      queryClient.invalidateQueries({ queryKey: ["performers"] });
      setReframing(false);
    },
  });

  const favorite = useMutation({
    mutationFn: (next: boolean) => setPerformerFavorite(id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performer", id] });
      // The performers page pins favourites to the top, so its list has to
      // re-sort too.
      queryClient.invalidateQueries({ queryKey: ["performers"] });
    },
  });

  const { data: performer, isError } = useQuery({
    queryKey: ["performer", id],
    queryFn: () => fetchPerformer(id),
  });

  if (isError) {
    return (
      <AppShell title="Performer not found">
        <p className="px-6 text-sm text-muted-foreground">
          That performer doesn’t exist — it may have been deleted.
        </p>
      </AppShell>
    );
  }

  const uploadedBanner = performer ? performerImageUrl(performer, "banner") : null;

  // Falls back to a frame from one of their videos until something is
  // uploaded, so a performer never renders as an empty grey slab.
  const bannerSrc =
    uploadedBanner ??
    (performer?.bannerItemId != null
      ? `/api/media-items/${performer.bannerItemId}/thumbnail`
      : null);
  // Same resolver the homepage row and the modal use, so all three show the
  // same face for a given performer.
  const avatarSrc = performer ? performerPortraitUrl(performer) : null;

  return (
    <AppShell>
      <section className="relative">
        <PerformerBanner
          performerId={performer?.id ?? 0}
          src={bannerSrc}
          positionY={performer?.bannerPositionY ?? 50}
          // Only meaningful for an uploaded image: a video-frame fallback is
          // regenerated from the poster, so a saved framing wouldn't stick to
          // anything.
          canReposition={Boolean(performer?.hasBanner)}
          editRequest={bannerEditRequest}
        >
          {performer && (
            <PerformerImagePicker
              performerId={performer.id}
              kind="banner"
              hasImage={performer.hasBanner}
              onUploaded={() => setBannerEditRequest((n) => n + 1)}
            />
          )}
        </PerformerBanner>

        {/* Minimal overlap — just enough to tie the portrait to the banner. */}
        <div className="relative -mt-8 flex flex-col items-start gap-4 px-6 sm:-mt-10 sm:flex-row sm:items-end">
          <div className="group relative shrink-0">
            <div className="size-28 overflow-hidden rounded-full bg-secondary ring-4 ring-background sm:size-36">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt=""
                  style={performer ? portraitStyle(performer) : undefined}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-4xl font-semibold text-muted-foreground">
                  {performer?.name.trim()[0]?.toUpperCase() ?? "?"}
                </div>
              )}
            </div>

            {performer && (
              <PerformerImageMenu
                performerId={performer.id}
                kind="avatar"
                hasImage={performer.hasImage}
                // A video-frame fallback can be reframed too — it's the same
                // CSS object-position, and nothing about the file changes.
                canReposition={Boolean(avatarSrc)}
                onReposition={() => setReframing(true)}
                onUploaded={() => setReframing(true)}
                // Bottom-right of the circle, the way a profile picture is
                // edited everywhere else.
                className="bottom-0 right-0"
              />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2 pb-1">
            <div className="flex items-center gap-2">
              <h1 className="sensitive truncate text-3xl font-bold tracking-tight sm:text-4xl">
                {performer?.name ?? " "}
              </h1>
              {performer && (
                <button
                  type="button"
                  onClick={() => favorite.mutate(!performer.isFavorite)}
                  disabled={favorite.isPending}
                  aria-pressed={performer.isFavorite}
                  aria-label={
                    performer.isFavorite ? "Remove from favourites" : "Add to favourites"
                  }
                  title={performer.isFavorite ? "Remove from favourites" : "Add to favourites"}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                >
                  <Heart
                    className={
                      performer.isFavorite ? "size-5 fill-red-500 text-red-500" : "size-5"
                    }
                  />
                </button>
              )}
            </div>
            {performer && <PerformerStats performer={performer} />}
            {performer && (
              <div className="space-y-2">
                {reframing && avatarSrc && (
                  <FramingEditor
                    src={avatarSrc}
                    value={{
                      x: performer.imagePositionX,
                      y: performer.imagePositionY,
                      scale: performer.imageScale,
                    }}
                    // The portrait's tallest frame is the 2:3 card on the
                    // performers page; framing here matches what that shows.
                    // The circular avatars crop further in from the same band.
                    aspectClass="aspect-[2/3]"
                    saving={saveFraming.isPending}
                    onSave={(next) => saveFraming.mutate(next)}
                    onCancel={() => setReframing(false)}
                    note="Used on the performers page, the home row and the avatar in a video's details."
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Full width rather than squeezed into the header column beside the
          avatar — prose needs a readable line length. */}
      {performer && (
        <div className="px-6 pt-6">
          <PerformerBio performerId={performer.id} bio={performer.bio} />
        </div>
      )}

      {performer && (
        <div className="space-y-8 px-6 py-8">
          {/* What you most likely came back for, before anything to browse. */}
          <PerformerContinueWatching performer={performer} onSelect={openItem} />

          <PerformerCoPerformers performers={performer.coPerformers} />

          <AlbumRow performer={performer.name} />

          <PerformerVideos performer={performer} onSelect={openItem} />
        </div>
      )}

      {open && (
        <MediaDetailModal
          itemId={open.id}
          autoPlay={open.autoPlay}
          onClose={() => setOpen(null)}
        />
      )}

    </AppShell>
  );
}
