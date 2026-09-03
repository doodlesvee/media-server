import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Film, Folder, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaViewer } from "./MediaViewer";

export type GridSource =
  | { type: "library"; tag: string | null; parentId: number | null }
  | { type: "collection"; id: number };

type MediaItem = {
  id: number;
  itemType: "video" | "photo" | "folder";
  title: string;
  durationSeconds: number | null;
  missingSince: string | null;
  playbackWarning: string | null;
};

type MediaItemsResponse = {
  items: MediaItem[];
  page: number;
  pageSize: number;
};

async function fetchMediaItems(source: GridSource): Promise<MediaItemsResponse> {
  if (source.type === "collection") {
    const res = await fetch(`/api/collections/${source.id}/items`);
    if (!res.ok) throw new Error(`Failed to load collection: ${res.status}`);
    return res.json();
  }

  const params = new URLSearchParams();
  if (source.tag) params.set("tag", source.tag);
  if (source.parentId !== null) params.set("parentId", String(source.parentId));

  const res = await fetch(`/api/media-items?${params}`);
  if (!res.ok) throw new Error(`Failed to load media items: ${res.status}`);
  return res.json();
}

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function MediaThumbnail({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false);

  if (item.itemType === "folder") {
    return <Folder className="size-8 text-muted-foreground" />;
  }

  if (failed) {
    return item.itemType === "video" ? (
      <Film className="size-8 text-muted-foreground" />
    ) : (
      <ImageIcon className="size-8 text-muted-foreground" />
    );
  }

  return (
    <img
      src={`/api/media-items/${item.id}/thumbnail`}
      alt=""
      onError={() => setFailed(true)}
      className="aspect-video w-full rounded object-cover"
    />
  );
}

export function MediaGrid({
  source,
  onOpenFolder,
}: {
  source: GridSource;
  onOpenFolder: (id: number, title: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data, error, isLoading } = useQuery({
    queryKey:
      source.type === "collection"
        ? ["collection-items", source.id]
        : ["media-items", source.tag, source.parentId],
    queryFn: () => fetchMediaItems(source),
  });

  if (isLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  if (error) {
    return <p className="text-destructive">Could not load this view.</p>;
  }

  if (!data || data.items.length === 0) {
    return (
      <p className="text-muted-foreground">
        {source.type === "collection"
          ? "This collection is empty."
          : "Nothing here yet."}
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {data.items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() =>
              item.itemType === "folder" ? onOpenFolder(item.id, item.title) : setSelectedId(item.id)
            }
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-center hover:bg-accent",
              item.missingSince && "opacity-50"
            )}
          >
            <MediaThumbnail item={item} />
            <span className="line-clamp-2 text-sm">{item.title}</span>
            {item.durationSeconds !== null && (
              <span className="font-mono text-xs text-muted-foreground">
                {formatDuration(item.durationSeconds)}
              </span>
            )}
            {item.missingSince && <span className="text-xs text-destructive">missing</span>}
          </button>
        ))}
      </div>

      {selectedId !== null && (
        <MediaViewer itemId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </>
  );
}
