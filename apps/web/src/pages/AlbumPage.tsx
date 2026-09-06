import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MediaDetailModal } from "@/components/MediaDetailModal";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { fetchAlbum } from "@/lib/albumApi";
import { thumbnailUrl } from "@/lib/mediaItemApi";

const routeApi = getRouteApi("/album/$albumId");

export function AlbumPage() {
  const { albumId } = routeApi.useParams();
  const id = Number(albumId);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);

  const { data, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["album", id],
    queryFn: ({ pageParam }) => fetchAlbum(id, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  if (isError) {
    return (
      <AppShell title="Album not found">
        <p className="px-6 text-sm text-muted-foreground">
          That album doesn’t exist — its folder may have been removed.
        </p>
      </AppShell>
    );
  }

  const album = data?.pages[0];
  // Flattened across pages, so the lightbox can step through everything
  // loaded so far rather than restarting at each page boundary.
  const photos = data?.pages.flatMap((p) => p.photos) ?? [];

  return (
    <AppShell>
      <div className="space-y-6 px-6 py-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{album?.title ?? " "}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {album?.performer && (
              <Link
                to="/browse"
                search={{ performer: album.performer }}
                className="font-medium text-foreground/90 hover:underline"
              >
                {album.performer}
              </Link>
            )}
            {album?.studio && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>{album.studio}</span>
              </>
            )}
            <span className="text-muted-foreground/40">·</span>
            <span>{photos.length} photos</span>
          </div>

          {album?.video && (
            <button
              type="button"
              onClick={() => setVideoOpen(true)}
              className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-accent"
            >
              <Play className="size-4 fill-current" />
              Play the video
            </button>
          )}
        </div>

        <div className="stagger grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setOpenIndex(index)}
              aria-label={`Open photo ${index + 1}`}
              className="group focus-visible:outline-none"
            >
              <img
                src={thumbnailUrl(photo)}
                alt=""
                loading="lazy"
                className="aspect-video w-full rounded-md object-cover ring-1 ring-border transition-all group-hover:ring-white/40"
              />
            </button>
          ))}
        </div>

        {hasNextPage && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="mx-auto block rounded-md bg-secondary px-4 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-50"
          >
            {isFetchingNextPage ? "Loading…" : "Show more photos"}
          </button>
        )}
      </div>

      {openIndex !== null && (
        <PhotoLightbox
          photos={photos}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}

      {videoOpen && album?.video && (
        <MediaDetailModal itemId={album.video.id} autoPlay onClose={() => setVideoOpen(false)} />
      )}
    </AppShell>
  );
}
