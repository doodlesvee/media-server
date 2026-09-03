import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { FolderPlus, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MediaGrid, type GridSource } from "@/components/MediaGrid";

const routeApi = getRouteApi("/browse");

type BreadcrumbEntry = { id: number; title: string };

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
      queryClient.invalidateQueries({ queryKey: ["stats"] });
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
      <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">
        Create
      </button>
    </form>
  );
}

export function BrowsePage() {
  const { tag, performer, collectionId, q } = routeApi.useSearch();
  const navigate = useNavigate();
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([]);

  const currentParentId = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].id : null;

  const source: GridSource =
    collectionId != null
      ? { type: "collection", id: collectionId }
      : {
          type: "library",
          tag: tag ?? null,
          performer: performer ?? null,
          q: q ?? null,
          parentId: currentParentId,
        };

  function clearFilters() {
    setBreadcrumb([]);
    void navigate({ to: "/browse", search: {} });
  }

  const activeFilter = tag
    ? `Tag: ${tag}`
    : performer
      ? `Performer: ${performer}`
      : q
        ? `Search: “${q}”`
        : null;

  return (
    <AppShell searchValue={q ?? ""}>
      <div className="space-y-5 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            {source.type === "library" && !tag && !performer && !q && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <button
                  type="button"
                  onClick={() => setBreadcrumb([])}
                  className={breadcrumb.length === 0 ? "text-foreground" : "hover:text-foreground"}
                >
                  Library
                </button>
                {breadcrumb.map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-1">
                    <span className="text-muted-foreground/50">/</span>
                    <button
                      type="button"
                      onClick={() => setBreadcrumb(breadcrumb.slice(0, i + 1))}
                      className={
                        i === breadcrumb.length - 1 ? "text-foreground" : "hover:text-foreground"
                      }
                    >
                      {crumb.title}
                    </button>
                  </span>
                ))}
              </div>
            )}

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

          {source.type === "library" && !tag && !performer && !q && (
            <NewFolderButton parentId={currentParentId} />
          )}
        </div>

        <MediaGrid
          source={source}
          onOpenFolder={(id, title) => setBreadcrumb([...breadcrumb, { id, title }])}
        />
      </div>
    </AppShell>
  );
}
