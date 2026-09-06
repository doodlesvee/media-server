import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { BulkActionBar } from "./BulkActionBar";
import { MediaCard, type MediaCardItem } from "./MediaCard";
import { MediaDetailModal } from "./MediaDetailModal";

export type GridSource =
  | {
      type: "library";
      tag: string | null;
      performer: string | null;
      studio: string | null;
      kind: string | null;
      q: string | null;
      parentId: number | null;
    }
  | { type: "collection"; id: number };

/** Mirrors the server's `SORTS` in `api/mediaItems.ts`. */
const SORT_OPTIONS = [
  { value: "newest", label: "Recently added" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title A–Z" },
  { value: "longest", label: "Longest" },
  { value: "shortest", label: "Shortest" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

type ReleaseYear = { year: number; total: number };

async function fetchReleaseYears(): Promise<{ years: ReleaseYear[] }> {
  const res = await fetch("/api/release-years");
  if (!res.ok) throw new Error(`Failed to load years: ${res.status}`);
  return res.json();
}

type MediaItemsResponse = {
  items: MediaCardItem[];
  page: number;
  pageSize: number;
  hasMore?: boolean;
};

async function fetchMediaItems(
  source: GridSource,
  sort: SortValue,
  year: string,
  page: number
): Promise<MediaItemsResponse> {
  if (source.type === "collection") {
    const res = await fetch(`/api/collections/${source.id}/items?page=${page}`);
    if (!res.ok) throw new Error(`Failed to load collection: ${res.status}`);
    return res.json();
  }

  const params = new URLSearchParams();
  if (source.tag) params.set("tag", source.tag);
  if (source.performer) params.set("performer", source.performer);
  if (source.studio) params.set("studio", source.studio);
  if (source.kind) params.set("kind", source.kind);
  if (source.q) params.set("q", source.q);
  if (source.parentId !== null) params.set("parentId", String(source.parentId));
  params.set("sort", sort);
  if (year) params.set("year", year);
  params.set("page", String(page));

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
  const [sort, setSort] = useState<SortValue>("newest");
  const [year, setYear] = useState("");

  const { data: yearData } = useQuery({ queryKey: ["release-years"], queryFn: fetchReleaseYears });
  const years = yearData?.years ?? [];

  const { data, error, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey:
        source.type === "collection"
          ? ["collection-items", source.id]
          : [
              "media-items",
              source.tag,
              source.performer,
              source.studio,
              source.kind,
              source.q,
              source.parentId,
              sort,
              // Must be in the key: without it React Query serves one year's
              // results for another, which reads as the filter doing nothing.
              year,
            ],
      queryFn: ({ pageParam }) => fetchMediaItems(source, sort, year, pageParam),
      initialPageParam: 1,
      // The server returns one row past the page size to answer this, so
      // there's no COUNT(*) behind it. Older responses without `hasMore` fall
      // back to a full page meaning "probably more".
      getNextPageParam: (lastPage) => {
        const more = lastPage.hasMore ?? lastPage.items.length === lastPage.pageSize;
        return more ? lastPage.page + 1 : undefined;
      },
    });

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  // Neither call site owns a scroll container — the page itself scrolls — so
  // the observer's default viewport root is the right one and needs no ref
  // plumbing from the parent.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      // Start the next page slightly before the sentinel is actually on
      // screen, so scrolling doesn't visibly stall at the boundary.
      { rootMargin: "400px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
      // No `stagger` here: it sets the same `animation` property the
      // skeletons need for their shimmer, and the two would fight.
      <div className="grid grid-cols-2 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="skeleton aspect-video rounded-md" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive">Could not load this view.</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">
        {source.type === "collection" ? "This collection is empty." : "Nothing here yet."}
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {selectionMode ? "Done selecting" : "Select"}
        </button>

        {/* A collection has its own order; offering to re-sort it would
            imply the choice sticks, which it wouldn't. */}
        {source.type === "library" && (
          <div className="flex items-center gap-3">
            {years.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Year</span>
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="cursor-pointer rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-foreground/30"
                >
                  <option value="">All</option>
                  {years.map((entry) => (
                    <option key={entry.year} value={String(entry.year)}>
                      {entry.year} ({entry.total})
                    </option>
                  ))}
                </select>
              </label>
            )}

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortValue)}
              className="cursor-pointer rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-foreground/30"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          </div>
        )}
      </div>

      {selectionMode && selectedIds.size > 0 && (
        <BulkActionBar selectedIds={[...selectedIds]} onDone={exitSelectionMode} />
      )}

      <div className="stagger grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            onClick={() => handleCardClick(item)}
            selectable={selectionMode}
            selected={selectedIds.has(item.id)}
          />
        ))}
      </div>

      <div ref={sentinelRef} aria-hidden className="h-px" />

      {isFetchingNextPage && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton aspect-video rounded-md" />
          ))}
        </div>
      )}

      {openItemId !== null && (
        <MediaDetailModal itemId={openItemId} onClose={() => setOpenItemId(null)} />
      )}
    </>
  );
}
