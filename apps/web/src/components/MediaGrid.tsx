import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { BulkActionBar } from "./BulkActionBar";
import { MediaCard, type MediaCardItem } from "./MediaCard";
import { tileWidthPx, useAppearance } from "@/lib/appearance";
import { cardLayout } from "@/lib/layout";
import { MediaDetailModal } from "./MediaDetailModal";
import { useQueue, type QueueItem } from "@/lib/queue";
import { Dices, ListPlus } from "lucide-react";
import { readPins } from "@/lib/pinned";
import {
  chunkIntoRows,
  columnsForWidth,
  columnWidthFor,
} from "@/lib/gridLayout";

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
  page: number,
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
  sort: initialSort = "newest",
  year: initialYear = "",
  onViewStateChange,
}: {
  source: GridSource;
  onOpenFolder: (id: number, title: string) => void;
  sort?: SortValue;
  year?: string;
  onViewStateChange?: (state: { sort: SortValue; year: string }) => void;
}) {
  const { tileSizePercent, tileInfo, viewMode, density } = useAppearance();
  const { add, clear } = useQueue();
  // Every length the grid needs comes from here, so the mode and density can
  // change the shape of the page without this component knowing what either
  // of them means.
  const layout = cardLayout(tileWidthPx(tileSizePercent), viewMode, density, tileInfo);
  const tileWidth = layout.widthPx;
  const [openItemId, setOpenItemId] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sort, setSort] = useState<SortValue>(initialSort);
  const [year, setYear] = useState(initialYear);

  const { data: yearData } = useQuery({
    queryKey: ["release-years"],
    queryFn: fetchReleaseYears,
  });
  const years = yearData?.years ?? [];

  const {
    data,
    error,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
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
      const more =
        lastPage.hasMore ?? lastPage.items.length === lastPage.pageSize;
      return more ? lastPage.page + 1 : undefined;
    },
  });

  const pinnedFolderIds = new Set(
    readPins()
      .filter((pin) => pin.type === "folder")
      .map((pin) => pin.folderId),
  );
  const items = (data?.pages.flatMap((p) => p.items) ?? []).sort(
    (a, b) =>
      Number(b.itemType === "folder" && pinnedFolderIds.has(b.id)) -
      Number(a.itemType === "folder" && pinnedFolderIds.has(a.id)),
  );

  // The space under each row is a row's own padding rather than a grid gap:
  // virtualized rows are absolutely positioned, so a grid row-gap would have
  // nothing to apply to.
  const COLUMN_GAP_PX = layout.columnGapPx;
  const ROW_SPACING_PX = layout.rowGapPx;

  const [gridNode, setGridNode] = useState<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(1);
  const [columnWidth, setColumnWidth] = useState(tileWidth);
  // How far the grid sits down the page. The window is the scroller, so the
  // virtualizer has to discount everything above the grid or every row lands
  // one header too high.
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const node = gridNode;
    if (!node) return;

    // Mirrors repeat(auto-fill, minmax(tileWidth, 1fr)) — the CSS the grid
    // used before it was virtualized — so the tile size chosen in Appearance
    // still decides the column count.
    const measure = () => {
      const width = node.clientWidth;
      const next = columnsForWidth(width, tileWidth, COLUMN_GAP_PX);
      setColumns(next);
      setColumnWidth(columnWidthFor(width, next, COLUMN_GAP_PX));
      setScrollMargin(node.offsetTop);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    // Also watched because the grid's offsetTop moves when something above it
    // appears — the bulk action bar, most visibly — which never changes the
    // grid's own size and so would not trigger the observer above.
    observer.observe(document.body);
    return () => observer.disconnect();
    // gridNode is a dependency, not a ref read, precisely because the grid is
    // not mounted on the first pass — the skeleton is.
  }, [gridNode, tileWidth, COLUMN_GAP_PX]);

  const rows = chunkIntoRows(items, columns);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    // Only the starting guess: measureElement below replaces it with the real
    // height as each row renders, so mixed card heights settle on their own.
    // Taken from the layout rather than hardcoded here, so the card's shape
    // and this scrollbar cannot drift apart.
    estimateSize: () =>
      Math.round(columnWidth * layout.heightRatio) + 72 + ROW_SPACING_PX,
    overscan: 3,
    scrollMargin,
  });
  const virtualRows = virtualizer.getVirtualItems();

  // One roving tab stop: Tab moves into the grid and straight back out, and
  // the arrows move within it. Without this, tabbing through a virtualized
  // grid would walk to the end of the rendered window and then fall out of
  // the grid entirely, with no way to reach the rest of the library.
  const [tabStop, setTabStop] = useState(0);
  const pendingFocus = useRef(false);
  const safeTabStop = Math.min(tabStop, Math.max(0, items.length - 1));

  useEffect(() => {
    if (!pendingFocus.current) return;
    const node = gridNode?.querySelector<HTMLElement>(
      `[data-grid-index="${safeTabStop}"]`,
    );
    // Missing means the row has not been rendered yet; the scroll below will
    // bring it in and this runs again on the next commit.
    if (node) {
      node.focus();
      pendingFocus.current = false;
    }
  }, [gridNode, safeTabStop, virtualRows]);

  function moveFocus(to: number) {
    const next = Math.max(0, Math.min(items.length - 1, to));
    if (next === safeTabStop) return;
    setTabStop(next);
    pendingFocus.current = true;
    virtualizer.scrollToIndex(Math.floor(next / columns), { align: "auto" });
  }

  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowRight: safeTabStop + 1,
      ArrowLeft: safeTabStop - 1,
      ArrowDown: safeTabStop + columns,
      ArrowUp: safeTabStop - columns,
      Home: 0,
      End: items.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    moveFocus(next);
  }

  // Keeps the tab stop on whatever was last focused, so clicking one card and
  // then using the arrows continues from there rather than jumping to the top.
  function handleGridFocus(event: React.FocusEvent<HTMLDivElement>) {
    const card = (event.target as HTMLElement).closest?.("[data-grid-index]");
    const index = Number(card?.getAttribute("data-grid-index"));
    if (!Number.isNaN(index)) setTabStop(index);
  }

  // Neither call site owns a scroll container — the page itself scrolls — so
  // the observer's default viewport root is the right one and needs no ref
  // plumbing from the parent.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage)
          void fetchNextPage();
      },
      // Start the next page slightly before the sentinel is actually on
      // screen, so scrolling doesn't visibly stall at the boundary.
      { rootMargin: "400px" },
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

  async function fetchAllQueueItems(): Promise<QueueItem[]> {
    const all: QueueItem[] = [];
    let page = 1;
    while (true) {
      const response = await fetchMediaItems(source, sort, year, page);
      all.push(
        ...response.items
          .filter((item) => item.itemType === "video")
          .map((item) => ({
            id: item.id,
            title: item.title,
            thumbnailFile: item.thumbnailFile,
            durationSeconds: item.durationSeconds,
          })),
      );
      const hasMore =
        response.hasMore ?? response.items.length === response.pageSize;
      if (!hasMore) return all;
      page += 1;
    }
  }

  async function queueResults(shuffle: boolean) {
    const queueItems = await fetchAllQueueItems();
    if (queueItems.length === 0) return;
    if (shuffle) {
      for (let i = queueItems.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [queueItems[i], queueItems[j]] = [queueItems[j], queueItems[i]];
      }
    }
    clear();
    queueItems.slice(1).forEach(add);
    setOpenItemId(queueItems[0].id);
  }

  if (isLoading) {
    return (
      // No `stagger` here: it sets the same `animation` property the
      // skeletons need for their shimmer, and the two would fight.
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${tileWidth}px), 1fr))`,
          columnGap: COLUMN_GAP_PX,
          rowGap: ROW_SPACING_PX,
        }}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="skeleton rounded-md"
            style={{ aspectRatio: layout.aspectRatio }}
          />
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
        {source.type === "collection"
          ? "This collection is empty."
          : "Nothing here yet."}
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() =>
            selectionMode ? exitSelectionMode() : setSelectionMode(true)
          }
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {selectionMode ? "Done selecting" : "Select"}
        </button>

        {/* A collection has its own order; offering to re-sort it would
            imply the choice sticks, which it wouldn't. */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void queueResults(false)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ListPlus className="size-3.5" /> Play all
          </button>
          <button
            type="button"
            onClick={() => void queueResults(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Dices className="size-3.5" /> Shuffle
          </button>
          {source.type === "library" && (
            <>
              {years.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Year</span>
                  <select
                    value={year}
                    onChange={(e) => {
                      setYear(e.target.value);
                      onViewStateChange?.({ sort, year: e.target.value });
                    }}
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
                  onChange={(e) => {
                    const next = e.target.value as SortValue;
                    setSort(next);
                    onViewStateChange?.({ sort: next, year });
                  }}
                  className="cursor-pointer rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-foreground/30"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      </div>

      {selectionMode && selectedIds.size > 0 && (
        <BulkActionBar
          selectedIds={[...selectedIds]}
          onDone={exitSelectionMode}
        />
      )}

      {/* Only the rows near the viewport exist in the DOM. A library of
          thousands used to build up that many card nodes as you scrolled and
          never gave any of them back.

          No `stagger` here, unlike the skeletons: rows mount as they are
          scrolled to, so an entry animation would re-run down the whole grid
          instead of playing once. */}
      <div
        ref={setGridNode}
        onKeyDown={handleGridKeyDown}
        onFocusCapture={handleGridFocus}
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 grid w-full"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                columnGap: COLUMN_GAP_PX,
                paddingBottom: ROW_SPACING_PX,
                transform: `translateY(${
                  virtualRow.start - virtualizer.options.scrollMargin
                }px)`,
              }}
            >
              {row.map((item, column) => {
                const index = virtualRow.index * columns + column;
                return (
                  <MediaCard
                    key={item.id}
                    item={item}
                    gridIndex={index}
                    tabIndex={index === safeTabStop ? 0 : -1}
                    onClick={() => handleCardClick(item)}
                    selectable={selectionMode}
                    selected={selectedIds.has(item.id)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      <div ref={sentinelRef} aria-hidden className="h-px" />

      {isFetchingNextPage && (
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${tileWidth}px), 1fr))`,
            columnGap: COLUMN_GAP_PX,
            rowGap: ROW_SPACING_PX,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="skeleton rounded-md"
              style={{ aspectRatio: layout.aspectRatio }}
            />
          ))}
        </div>
      )}

      {openItemId !== null && (
        <MediaDetailModal
          itemId={openItemId}
          onClose={() => setOpenItemId(null)}
        />
      )}
    </>
  );
}
