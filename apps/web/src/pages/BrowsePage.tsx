import { useEffect, useMemo, useState } from "react";
import { libraryStatsKey } from "@/lib/statsApi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { FolderPlus, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MediaGrid, type GridSource } from "@/components/MediaGrid";
import { PlaySurface } from "@/components/PlaySurface";
import { cn } from "@/lib/utils";
import { PageScope } from "@/lib/appearance";
import { FilterBar } from "@/components/FilterBar";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import {
  filtersFromSearch,
  filtersToSearch,
  hasActiveFilters,
  type Filters,
} from "@/lib/filters";

const routeApi = getRouteApi("/browse");

type BreadcrumbEntry = { id: number; title: string };
type Folder = { id: number; title: string; parentId: number | null };

function BreadcrumbText({ value }: { value: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="text-muted-foreground/50">/</span>
      <span className="max-w-40 truncate">{value}</span>
    </span>
  );
}

async function createFolder(title: string, parentId: number | null) {
  const res = await fetch("/api/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, parentId }),
  });
  if (!res.ok) throw new Error(`Failed to create folder: ${res.status}`);
  return res.json();
}

function NewFolderButton({ parentId }: { parentId: number | null }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (name: string) => createFolder(name, parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-items"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: libraryStatsKey });
      setTitle("");
      setEditing(false);
    },
  });

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <FolderPlus className="size-3.5" /> New Folder
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) mutation.mutate(title.trim());
      }}
      className="flex items-center gap-2"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => !title && setEditing(false)}
        placeholder="Folder name"
        className="rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
      />
      <button
        type="submit"
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Create
      </button>
    </form>
  );
}

export function BrowsePage() {
  const search = routeApi.useSearch();
  const { tag, performer, studio, kind, collectionId, parentId, q, sort, year } =
    search;
  const filters = filtersFromSearch(search as Record<string, unknown>);
  const navigate = useNavigate();
  const { data: folderData } = useQuery({
    queryKey: ["folders"],
    queryFn: async () => {
      const response = await fetch("/api/folders");
      if (!response.ok)
        throw new Error(`Failed to load folders: ${response.status}`);
      return response.json() as Promise<{ folders: Folder[] }>;
    },
  });
  const folders = folderData?.folders ?? [];
  const breadcrumb = useMemo(() => {
    const entries: BreadcrumbEntry[] = [];
    const seen = new Set<number>();
    let current =
      parentId == null
        ? undefined
        : folders.find((folder) => folder.id === parentId);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      entries.unshift({ id: current.id, title: current.title });
      current =
        current.parentId == null
          ? undefined
          : folders.find((folder) => folder.id === current!.parentId);
    }
    return entries;
  }, [folders, parentId]);

  useEffect(() => {
    const key = `browse-scroll:${window.location.search}`;
    const restore = () =>
      window.scrollTo({ top: Number(sessionStorage.getItem(key) ?? 0) });
    const save = () => sessionStorage.setItem(key, String(window.scrollY));
    window.addEventListener("scroll", save, { passive: true });
    requestAnimationFrame(restore);
    return () => {
      save();
      window.removeEventListener("scroll", save);
    };
  }, [parentId, tag, performer, studio, kind, collectionId, q, sort, year]);

  const currentParentId = parentId ?? null;

  const source: GridSource =
    collectionId != null
      ? { type: "collection", id: collectionId }
      : {
          type: "library",
          tag: tag ?? null,
          performer: performer ?? null,
          studio: studio ?? null,
          kind: kind ?? null,
          q: q ?? null,
          parentId: currentParentId,
          filters,
        };

  function clearFilters() {
    void navigate({ to: "/browse", search: {} });
  }

  /**
   * Writes a filter change back to the URL.
   *
   * Merged over the current search rather than replacing it, so the folder
   * and sort survive a filter change; the cleared entries come through as
   * explicit `undefined`, which is what removes them from the href.
   *
   * `parentId` is dropped whenever a filter is applied. The filters are
   * global lookups — the server stops scoping to a folder as soon as one is
   * set — so leaving a folder in the URL would show a breadcrumb that no
   * longer describes what is on screen.
   */
  function applyFilters(next: Filters) {
    void navigate({
      to: "/browse",
      search: (current) => ({
        ...current,
        ...filtersToSearch(next),
        parentId: hasActiveFilters(next) ? undefined : current.parentId,
      }),
    });
  }

  /**
   * Which layout context this page counts as (§1).
   *
   * BrowsePage renders several of the contexts the spec names — the library,
   * a collection, a performer's or studio's items — so the scope comes from
   * the search params rather than the route. Keeping collections on one
   * shared "collection" scope rather than one per id is deliberate: a
   * per-collection layout is a setting nobody asked for and hundreds of
   * stored entries nobody will ever clear.
   */
  const scope =
    collectionId != null
      ? "collection"
      : performer
        ? "performer"
        : studio
          ? "studio"
          : q
            ? "search"
            : "library";

  const activeFilter = tag
    ? `Tag: ${tag}`
    : studio
      ? `Studio: ${studio}`
      : performer
        ? `Performer: ${performer}`
        : kind
          ? kind.charAt(0).toUpperCase() + kind.slice(1) + "s"
          : q
            ? `Search: “${q}”`
            : null;

  return (
    // Outside AppShell, not inside it: the appearance menu lives in the
    // shell's header, and it has to read the same scope the grid below it
    // writes to or the panel would be editing a page it isn't on.
    <PageScope name={scope}>
      <AppShell>
        <div className="space-y-5 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <div className="flex min-w-0 items-center gap-1 text-muted-foreground">
              <button
                type="button"
                onClick={() => void navigate({ to: "/browse", search: {} })}
                className="shrink-0 hover:text-foreground"
              >
                Library
              </button>
              {performer && (
                <BreadcrumbText value={`Performer: ${performer}`} />
              )}
              {studio && <BreadcrumbText value={`Studio: ${studio}`} />}
              {collectionId != null && <BreadcrumbText value="Collection" />}
              {kind && <BreadcrumbText value={kind} />}
              {q && <BreadcrumbText value={`Search: ${q}`} />}
              {breadcrumb.map((crumb, i) => (
                <span
                  key={crumb.id}
                  className="flex min-w-0 items-center gap-1"
                >
                  <span className="text-muted-foreground/50">/</span>
                  <button
                    type="button"
                    onClick={() =>
                      void navigate({
                        to: "/browse",
                        search: { parentId: crumb.id },
                      })
                    }
                    className={cn(
                      "max-w-40 truncate hover:text-foreground",
                      i === breadcrumb.length - 1 && "text-foreground",
                    )}
                  >
                    {crumb.title}
                  </button>
                </span>
              ))}
            </div>

            {activeFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs hover:bg-accent"
              >
                {activeFilter}
                <X className="size-3" />
              </button>
            )}

            {collectionId != null && (
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs hover:bg-accent"
              >
                Collection
                <X className="size-3" />
              </button>
            )}
          </div>

          {source.type === "library" &&
            !tag &&
            !performer &&
            !studio &&
            !kind &&
            !q && <NewFolderButton parentId={currentParentId} />}
        </div>

        {source.type === "library" && (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <FilterBar
              filters={filters}
              onChange={applyFilters}
              onClear={clearFilters}
            />
            {/* Only once there is something worth coming back to. */}
            {(hasActiveFilters(filters) || q) && (
              <SaveSearchButton
                filters={filters}
                query={q}
                search={window.location.search.replace(/^\?/, "")}
              />
            )}
          </div>
        )}

        {collectionId != null && (
          <PlaySurface
            source={{ type: "collection", id: collectionId }}
            label="Collection playback"
          />
        )}
        <MediaGrid
          source={source}
          sort={sort as Parameters<typeof MediaGrid>[0]["sort"]}
          year={year != null ? String(year) : ""}
          onViewStateChange={(state) =>
            void navigate({
              to: "/browse",
              search: (current) => ({
                ...current,
                sort: state.sort,
                year: state.year ? Number(state.year) : undefined,
              }),
            })
          }
          onOpenFolder={(id) =>
            void navigate({ to: "/browse", search: { parentId: id } })
          }
        />
        </div>
      </AppShell>
    </PageScope>
  );
}
