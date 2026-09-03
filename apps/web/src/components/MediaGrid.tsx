import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckSquare, Film, Folder, Image as ImageIcon, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { BulkActionBar } from "./BulkActionBar";
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data, error, isLoading } = useQuery({
    queryKey:
      source.type === "collection"
        ? ["collection-items", source.id]
        : ["media-items", source.tag, source.parentId],
    queryFn: () => fetchMediaItems(source),
  });

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCardClick(item: MediaItem) {
    if (selectionMode) {
      toggleSelected(item.id);
      return;
    }
    if (item.itemType === "folder") {
      onOpenFolder(item.id, item.title);
    } else {
      setSelectedId(item.id);
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  if (error) {
    return <p className="text-destructive">Could not load this view.</p>;
  }

  if (!data || data.items.length === 0) {
    return (
      <p className="text-muted-foreground">
        {source.type === "collection" ? "This collection is empty." : "Nothing here yet."}
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {selectionMode ? "Done selecting" : "Select"}
        </button>
      </div>

      {selectionMode && selectedIds.size > 0 && (
        <BulkActionBar selectedIds={[...selectedIds]} onDone={exitSelectionMode} />
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {data.items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleCardClick(item)}
            className={cn(
              "relative flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-center hover:bg-accent",
              item.missingSince && "opacity-50",
              selectionMode && selectedIds.has(item.id) && "border-primary bg-accent"
            )}
          >
            {selectionMode && (
              <span className="absolute right-2 top-2">
                {selectedIds.has(item.id) ? (
                  <CheckSquare className="size-4 text-primary" />
                ) : (
                  <Square className="size-4 text-muted-foreground" />
                )}
              </span>
            )}
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
