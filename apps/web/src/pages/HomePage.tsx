import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { HeroBanner } from "@/components/HeroBanner";
import type { MediaCardItem } from "@/components/MediaCard";
import { MediaDetailModal } from "@/components/MediaDetailModal";
import { MediaRow } from "@/components/MediaRow";
import { PerformerRow } from "@/components/PerformerRow";

type Tag = { id: number; name: string };
type Collection = { id: number; name: string; type: "manual" | "smart" };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

// Rows are a discovery preview — a full browse of a tag/collection happens
// on the Browse page.
const ROW_LIMIT = 15;

// Folders have no meaningful click target in a row-based view.
function withoutFolders(items: MediaCardItem[]): MediaCardItem[] {
  return items.filter((i) => i.itemType !== "folder").slice(0, ROW_LIMIT);
}

function noopOpenFolder() {}

function TagRow({
  tag,
  onSelectItem,
  onPlayItem,
}: {
  tag: Tag;
  onSelectItem: (id: number) => void;
  onPlayItem: (id: number) => void;
}) {
  const { data } = useQuery({
    queryKey: ["media-items", "tag-row", tag.name],
    queryFn: () =>
      fetchJson<{ items: MediaCardItem[] }>(`/api/media-items?tag=${encodeURIComponent(tag.name)}`),
  });

  return (
    <MediaRow
      title={tag.name}
      items={withoutFolders(data?.items ?? [])}
      onSelectItem={onSelectItem}
      onPlayItem={onPlayItem}
      onOpenFolder={noopOpenFolder}
    />
  );
}

function CollectionRow({
  collection,
  onSelectItem,
  onPlayItem,
}: {
  collection: Collection;
  onSelectItem: (id: number) => void;
  onPlayItem: (id: number) => void;
}) {
  const { data } = useQuery({
    queryKey: ["collection-items", "row", collection.id],
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>(`/api/collections/${collection.id}/items`),
  });

  return (
    <MediaRow
      title={collection.name}
      items={withoutFolders(data?.items ?? [])}
      onSelectItem={onSelectItem}
      onPlayItem={onPlayItem}
      onOpenFolder={noopOpenFolder}
    />
  );
}

export function HomePage() {
  const [open, setOpen] = useState<{ id: number; autoPlay: boolean } | null>(null);

  const { data: recent } = useQuery({
    queryKey: ["media-items", "recent"],
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>("/api/media-items"),
  });
  const { data: continueWatching } = useQuery({
    queryKey: ["continue-watching"],
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>("/api/continue-watching"),
  });
  const { data: tagsData } = useQuery({
    queryKey: ["tags"],
    queryFn: () => fetchJson<{ tags: Tag[] }>("/api/tags"),
  });
  const { data: collectionsData } = useQuery({
    queryKey: ["collections"],
    queryFn: () => fetchJson<{ collections: Collection[] }>("/api/collections"),
  });

  const recentItems = withoutFolders(recent?.items ?? []);
  // Rotate the hero through the newest few rather than pinning one item.
  const heroItems = recentItems.filter((i) => i.itemType === "video").slice(0, 5);

  function openItem(id: number, autoPlay: boolean) {
    setOpen({ id, autoPlay });
  }

  return (
    <AppShell>
      {heroItems.length > 0 && (
        <HeroBanner
          items={heroItems}
          onPlay={(id) => openItem(id, true)}
          onMoreInfo={(id) => openItem(id, false)}
        />
      )}

      <div className="space-y-9 px-6 py-8">
        <MediaRow
          title="Continue Watching"
          items={continueWatching?.items ?? []}
          onSelectItem={(id) => openItem(id, false)}
          onPlayItem={(id) => openItem(id, true)}
          onOpenFolder={noopOpenFolder}
        />
        {/* Above Recently Added: with a library organised by performer
            folders, this is the primary way you'd actually browse it. */}
        <PerformerRow />

        <MediaRow
          title="Recently Added"
          items={recentItems}
          onSelectItem={(id) => openItem(id, false)}
          onPlayItem={(id) => openItem(id, true)}
          onOpenFolder={noopOpenFolder}
        />
        {collectionsData?.collections.map((collection) => (
          <CollectionRow
            key={collection.id}
            collection={collection}
            onSelectItem={(id) => openItem(id, false)}
            onPlayItem={(id) => openItem(id, true)}
          />
        ))}
        {tagsData?.tags.map((tag) => (
          <TagRow
            key={tag.id}
            tag={tag}
            onSelectItem={(id) => openItem(id, false)}
            onPlayItem={(id) => openItem(id, true)}
          />
        ))}
      </div>

      {open && (
        <MediaDetailModal itemId={open.id} autoPlay={open.autoPlay} onClose={() => setOpen(null)} />
      )}
    </AppShell>
  );
}
