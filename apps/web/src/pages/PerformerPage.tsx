import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Move } from "lucide-react";
import { FramingEditor, type FramingValue } from "@/components/FramingEditor";
import { getRouteApi } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MediaDetailModal } from "@/components/MediaDetailModal";
import { PerformerContinueWatching } from "@/components/PerformerContinueWatching";
import { PerformerCoPerformers } from "@/components/PerformerCoPerformers";
import { PerformerStats } from "@/components/PerformerStats";
import { PerformerVideos } from "@/components/PerformerVideos";
import { PerformerBanner } from "@/components/PerformerBanner";
import { PerformerBio } from "@/components/PerformerBio";
import { PerformerImagePicker } from "@/components/PerformerImagePicker";
import {
  fetchPerformer,
  performerImageUrl,
  performerPortraitUrl,
  portraitStyle,
  savePortraitFraming,
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
        <div className="relative mx-auto -mt-8 flex max-w-7xl flex-col items-start gap-4 px-6 sm:-mt-10 sm:flex-row sm:items-end">
          <div className="relative shrink-0">
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
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2 pb-1">
            <h1 className="truncate text-3xl font-bold tracking-tight sm:text-4xl">
              {performer?.name ?? " "}
            </h1>
            {performer && <PerformerStats performer={performer} />}
            {performer && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <PerformerImagePicker
                    performerId={performer.id}
                    kind="avatar"
                    hasImage={performer.hasImage}
                    onUploaded={() => setReframing(true)}
                  />
                  {avatarSrc && !reframing && (
                    <button
                      type="button"
                      onClick={() => setReframing(true)}
                      className="flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1.5 text-xs font-medium text-white ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-black/80"
                    >
                      <Move className="size-3.5" />
                      Reposition
                    </button>
                  )}
                </div>

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
        <div className="mx-auto max-w-7xl px-6 pt-6">
          <PerformerBio performerId={performer.id} bio={performer.bio} />
        </div>
      )}

      {performer && (
        <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
          {/* What you most likely came back for, before anything to browse. */}
          <PerformerContinueWatching performer={performer} onSelect={openItem} />

          <PerformerCoPerformers performers={performer.coPerformers} />

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
