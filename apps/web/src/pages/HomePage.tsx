import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { HeroBanner } from "@/components/HeroBanner";
import type { MediaCardItem } from "@/components/MediaCard";
import { MediaDetailModal } from "@/components/MediaDetailModal";
import { ClearContinueWatching } from "@/components/ClearContinueWatching";
import { KindTiles } from "@/components/KindTiles";
import { ROW_TILE_LIMIT } from "@/lib/rowLimits";
import { MediaRow } from "@/components/MediaRow";
import { PerformerRow } from "@/components/PerformerRow";
import { useAppearance, PageScope } from "@/lib/appearance";
import { StudioRow } from "@/components/StudioRow";
import { RecentRow } from "@/components/RecentRow";
import { PinnedRow } from "@/components/PinnedRow";
import { WelcomeBack } from "@/components/WelcomeBack";

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
      seeMore={{ to: "/browse", search: { tag: tag.name } }}
      items={withoutFolders(data?.items ?? []).slice(0, ROW_TILE_LIMIT)}
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
      seeMore={{ to: "/browse", search: { collectionId: collection.id } }}
      items={withoutFolders(data?.items ?? []).slice(0, ROW_TILE_LIMIT)}
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
  const { data: recentlyWatched, isLoading: recentlyWatchedLoading } = useQuery({
    queryKey: ["media-items", "recently-watched"],
    queryFn: () =>
      fetchJson<{ items: MediaCardItem[] }>(
        "/api/media-items?sort=watched&watched=true",
      ),
  });
  const { data: mostPlayed, isLoading: mostPlayedLoading } = useQuery({
    queryKey: ["media-items", "most-played"],
    queryFn: () =>
      fetchJson<{ items: MediaCardItem[] }>(
        "/api/media-items?sort=played&watched=true",
      ),
  });
  const { data: unwatched, isLoading: unwatchedLoading } = useQuery({
    queryKey: ["media-items", "unwatched"],
    queryFn: () =>
      fetchJson<{ items: MediaCardItem[] }>("/api/media-items?watched=false"),
  });
  /**
   * A shuffle that holds for the session rather than re-rolling per render.
   *
   * The seed is state with a lazy initialiser, so "Random picks" is a
   * different set each time you come back to the home page but the same set
   * while you are on it — a row that reshuffled under the pointer would be
   * unusable.
   */
  const [randomSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const { data: randomPicks, isLoading: randomLoading } = useQuery({
    queryKey: ["media-items", "random-picks", randomSeed],
    queryFn: () =>
      fetchJson<{ items: MediaCardItem[] }>(
        `/api/media-items?sort=random&seed=${randomSeed}`,
      ),
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
    <PageScope name="home">
      <AppShell>
        <WelcomeBack />
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
                      items={(continueWatching?.items ?? []).slice(0, ROW_TILE_LIMIT)}
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
                      items={withoutFolders(favorites?.items ?? []).slice(0, ROW_TILE_LIMIT)}
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
                      seeMore={{ to: "/browse" }}
                      items={recentItems.slice(0, ROW_TILE_LIMIT)}
                      loading={recentLoading}
                      onSelectItem={(id) => openItem(id, false)}
                      onPlayItem={(id) => openItem(id, true)}
                      onOpenFolder={noopOpenFolder}
                    />
                  );
                case "recentlyWatched":
                  return (
                    <MediaRow
                      key={key}
                      title="Recently Watched"
                      seeMore={{ to: "/browse", search: { sort: "watched" } }}
                      items={withoutFolders(recentlyWatched?.items ?? []).slice(
                        0,
                        ROW_TILE_LIMIT,
                      )}
                      loading={recentlyWatchedLoading}
                      onSelectItem={(id) => openItem(id, false)}
                      onPlayItem={(id) => openItem(id, true)}
                      onOpenFolder={noopOpenFolder}
                    />
                  );
                case "mostPlayed":
                  return (
                    <MediaRow
                      key={key}
                      title="Most Played"
                      seeMore={{ to: "/browse", search: { sort: "played" } }}
                      items={withoutFolders(mostPlayed?.items ?? []).slice(
                        0,
                        ROW_TILE_LIMIT,
                      )}
                      loading={mostPlayedLoading}
                      onSelectItem={(id) => openItem(id, false)}
                      onPlayItem={(id) => openItem(id, true)}
                      onOpenFolder={noopOpenFolder}
                    />
                  );
                case "unwatched":
                  return (
                    <MediaRow
                      key={key}
                      title="Unwatched"
                      seeMore={{ to: "/browse", search: { watched: "false" } }}
                      items={withoutFolders(unwatched?.items ?? []).slice(
                        0,
                        ROW_TILE_LIMIT,
                      )}
                      loading={unwatchedLoading}
                      onSelectItem={(id) => openItem(id, false)}
                      onPlayItem={(id) => openItem(id, true)}
                      onOpenFolder={noopOpenFolder}
                    />
                  );
                case "recentlyBrowsed":
                  return (
                    <RecentRow
                      key={key}
                      title="Recently Browsed"
                      kind="browsed"
                      onSelectItem={(id) => openItem(id, false)}
                      onPlayItem={(id) => openItem(id, true)}
                    />
                  );
                case "recentlyInteracted":
                  return (
                    <RecentRow
                      key={key}
                      title="Recently Interacted"
                      kind="interacted"
                      onSelectItem={(id) => openItem(id, false)}
                      onPlayItem={(id) => openItem(id, true)}
                    />
                  );
                case "randomPicks":
                  return (
                    <MediaRow
                      key={key}
                      title="Random Picks"
                      items={withoutFolders(randomPicks?.items ?? []).slice(
                        0,
                        ROW_TILE_LIMIT,
                      )}
                      loading={randomLoading}
                      onSelectItem={(id) => openItem(id, false)}
                      onPlayItem={(id) => openItem(id, true)}
                      onOpenFolder={noopOpenFolder}
                    />
                  );
                case "pinned":
                  return <PinnedRow key={key} />;
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
    </PageScope>
  );
}
