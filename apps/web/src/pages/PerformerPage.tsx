import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MediaGrid } from "@/components/MediaGrid";
import { PerformerBanner } from "@/components/PerformerBanner";
import { PerformerImagePicker } from "@/components/PerformerImagePicker";
import { fetchPerformer, performerImageUrl, performerPortraitUrl } from "@/lib/performerApi";

const routeApi = getRouteApi("/performer/$performerId");

function formatTotalDuration(seconds: number): string | null {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function PerformerPage() {
  const { performerId } = routeApi.useParams();
  const id = Number(performerId);

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

  const totalDuration = formatTotalDuration(performer?.totalDurationSeconds ?? 0);

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
        >
          {performer && (
            <PerformerImagePicker
              performerId={performer.id}
              kind="banner"
              hasImage={performer.hasBanner}
            />
          )}
        </PerformerBanner>

        {/* Minimal overlap — just enough to tie the portrait to the banner. */}
        <div className="relative mx-auto -mt-8 flex max-w-7xl flex-col items-start gap-4 px-6 sm:-mt-10 sm:flex-row sm:items-end">
          <div className="relative shrink-0">
            <div className="size-28 overflow-hidden rounded-full bg-secondary ring-4 ring-background sm:size-36">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="h-full w-full object-cover object-top" />
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
            {performer && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground/90">
                  {performer.videoCount} {performer.videoCount === 1 ? "video" : "videos"}
                </span>
                {totalDuration && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span>{totalDuration} total</span>
                  </>
                )}
              </div>
            )}
            {performer && (
              <PerformerImagePicker
                performerId={performer.id}
                kind="avatar"
                hasImage={performer.hasImage}
              />
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {performer && (
          <MediaGrid
            source={{
              type: "library",
              tag: null,
              performer: performer.name,
              q: null,
              parentId: null,
            }}
            onOpenFolder={() => {}}
          />
        )}
      </div>

    </AppShell>
  );
}
