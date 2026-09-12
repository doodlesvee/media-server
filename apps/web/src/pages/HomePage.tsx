import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { HeroBanner } from "@/components/HeroBanner";
import type { MediaCardItem } from "@/components/MediaCard";
import { MediaDetailModal } from "@/components/MediaDetailModal";
import { ClearContinueWatching } from "@/components/ClearContinueWatching";
import { KindTiles } from "@/components/KindTiles";
import { MediaRow } from "@/components/MediaRow";
import { PerformerRow } from "@/components/PerformerRow";
import { useAppearance } from "@/lib/appearance";
import { StudioRow } from "@/components/StudioRow";

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
  const { data, isLoading } = useQuery({
    queryKey: ["media-items", "tag-row", tag.name],
    queryFn: () =>
      fetchJson<{ items: MediaCardItem[] }>(`/api/media-items?tag=${encodeURIComponent(tag.name)}`),
  });

  return (
    <MediaRow
      title={tag.name}
      items={withoutFolders(data?.items ?? [])}
      loading={isLoading}
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
  const { data, isLoading } = useQuery({
    queryKey: ["collection-items", "row", collection.id],
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>(`/api/collections/${collection.id}/items`),
  });

  return (
    <MediaRow
      title={collection.name}
      items={withoutFolders(data?.items ?? [])}
      loading={isLoading}
      onSelectItem={onSelectItem}
      onPlayItem={onPlayItem}
      onOpenFolder={noopOpenFolder}
    />
  );
}

export function HomePage() {
  const [open, setOpen] = useState<{ id: number; autoPlay: boolean } | null>(null);

  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ["media-items", "recent"],
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>("/api/media-items"),
  });
  const { data: heroData } = useQuery({
    queryKey: ["hero-items"],
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>("/api/hero-items"),
  });
  const { data: favorites, isLoading: favoritesLoading } = useQuery({
    queryKey: ["media-items", "favorites"],
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>("/api/media-items?favorite=true"),
  });
  const { data: continueWatching, isLoading: continueLoading } = useQuery({
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
  // Chosen by the hero setting, resolved server-side.
  const heroItems = heroData?.items ?? [];

  const { homeRows } = useAppearance();

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

      <div className="stagger space-y-9 px-6 py-8">
        {/* Rendered from the saved order rather than written out in sequence,
            so hiding or moving a section is a data change rather than an edit
            here. Each case returns null when it has nothing, exactly as it did
            before — an empty row was never shown. */}
        {homeRows
          .filter((row) => row.visible)
          .map(({ key }) => {
            switch (key) {
              case "categories":
                return <KindTiles key={key} />;
              case "continue":
                return (
                  <MediaRow
                    key={key}
                    title="Continue Watching"
                    action={<ClearContinueWatching />}
                    items={continueWatching?.items ?? []}
                    loading={continueLoading}
                    onSelectItem={(id) => openItem(id, false)}
                    onPlayItem={(id) => openItem(id, true)}
                    onOpenFolder={noopOpenFolder}
                  />
                );
              case "favourites":
                return (
                  <MediaRow
                    key={key}
                    title="Favourites"
                    items={withoutFolders(favorites?.items ?? [])}
                    loading={favoritesLoading}
                    onSelectItem={(id) => openItem(id, false)}
                    onPlayItem={(id) => openItem(id, true)}
                    onOpenFolder={noopOpenFolder}
                  />
                );
              case "performers":
                return <PerformerRow key={key} />;
              case "studios":
                return <StudioRow key={key} />;
              case "recent":
                return (
                  <MediaRow
                    key={key}
                    title="Recently Added"
                    items={recentItems}
                    loading={recentLoading}
                    onSelectItem={(id) => openItem(id, false)}
                    onPlayItem={(id) => openItem(id, true)}
                    onOpenFolder={noopOpenFolder}
                  />
                );
              case "collections":
                return collectionsData?.collections.map((collection) => (
                  <CollectionRow
                    key={`collection-${collection.id}`}
                    collection={collection}
                    onSelectItem={(id) => openItem(id, false)}
                    onPlayItem={(id) => openItem(id, true)}
                  />
                ));
              case "tags":
                return tagsData?.tags.map((tag) => (
                  <TagRow
                    key={`tag-${tag.id}`}
                    tag={tag}
                    onSelectItem={(id) => openItem(id, false)}
                    onPlayItem={(id) => openItem(id, true)}
                  />
                ));
            }
          })}
      </div>

      {open && (
        <MediaDetailModal itemId={open.id} autoPlay={open.autoPlay} onClose={() => setOpen(null)} />
      )}
    </AppShell>
  );
}
