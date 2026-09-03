import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BulkActionBar } from "./BulkActionBar";
import { MediaCard, type MediaCardItem } from "./MediaCard";
import { MediaDetailModal } from "./MediaDetailModal";

export type GridSource =
  | {
      type: "library";
      tag: string | null;
      performer: string | null;
      q: string | null;
      parentId: number | null;
    }
  | { type: "collection"; id: number };

type MediaItemsResponse = {
  items: MediaCardItem[];
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
  if (source.performer) params.set("performer", source.performer);
  if (source.q) params.set("q", source.q);
  if (source.parentId !== null) params.set("parentId", String(source.parentId));

  const res = await fetch(`/api/media-items?${params}`);
  if (!res.ok) throw new Error(`Failed to load media items: ${res.status}`);
  return res.json();
}

export function MediaGrid({
  source,
  onOpenFolder,
}: {
  source: GridSource;
  onOpenFolder: (id: number, title: string) => void;
}) {
  const [openItemId, setOpenItemId] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data, error, isLoading } = useQuery({
    queryKey:
      source.type === "collection"
        ? ["collection-items", source.id]
        : ["media-items", source.tag, source.performer, source.q, source.parentId],
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

  function handleCardClick(item: MediaCardItem) {
    if (selectionMode) {
      toggleSelected(item.id);
      return;
    }
    if (item.itemType === "folder") {
      onOpenFolder(item.id, item.title);
    } else {
      setOpenItemId(item.id);
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="animate-pulse space-y-1.5">
            <div className="aspect-video rounded-md bg-secondary" />
            <div className="h-3 w-3/4 rounded bg-secondary" />
          </div>
        ))}
      </div>
    );
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

      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {data.items.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            onClick={() => handleCardClick(item)}
            selectable={selectionMode}
            selected={selectedIds.has(item.id)}
          />
        ))}
      </div>

      {openItemId !== null && (
        <MediaDetailModal itemId={openItemId} onClose={() => setOpenItemId(null)} />
      )}
    </>
  );
}
