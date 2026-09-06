import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Images } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { fetchAlbums, type AlbumSummary } from "@/lib/albumApi";
import { thumbnailUrl } from "@/lib/mediaItemApi";

function AlbumCard({ album }: { album: AlbumSummary }) {
  return (
    <Link
      to="/album/$albumId"
      params={{ albumId: String(album.id) }}
      className="group block focus-visible:outline-none"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-secondary ring-1 ring-border transition-all duration-200 group-hover:ring-white/40">
        {album.coverItemId != null ? (
          <img
            src={thumbnailUrl({ id: album.coverItemId })}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Images className="size-8 text-muted-foreground" />
          </div>
        )}

        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-2.5 pb-2 pt-8">
          <span className="block truncate text-[10px] font-medium uppercase tracking-wide text-white/70">
            {[album.performer, album.studio].filter(Boolean).join(" · ")}
          </span>
          <span className="line-clamp-2 text-xs font-medium leading-snug text-white drop-shadow">
            {album.title}
          </span>
        </span>

        <span className="absolute right-1.5 top-1.5 rounded bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-white">
          {album.photoCount}
        </span>
      </div>
    </Link>
  );
}

export function AlbumsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["albums"], queryFn: fetchAlbums });
  const albums = data?.albums ?? [];

  return (
    <AppShell title="Albums" subtitle="Photo sets that came with your videos.">
      <div className="px-6 py-6">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton aspect-video rounded-md" />
            ))}
          </div>
        ) : albums.length === 0 ? (
          <p className="text-muted-foreground">
            No albums yet — a folder of images next to a video becomes one automatically.
          </p>
        ) : (
          <div className="stagger grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
            {albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
