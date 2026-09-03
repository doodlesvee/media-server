import { useState } from "react";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderPlus } from "lucide-react";
import { CollectionsSidebar } from "@/components/CollectionsSidebar";
import { MediaGrid, type GridSource } from "@/components/MediaGrid";
import { RescanButton } from "@/components/RescanButton";
import { TagFilterBar } from "@/components/TagFilterBar";

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
      setTitle("");
      setEditing(false);
    },
  });

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
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
        className="rounded border border-border bg-transparent px-2 py-1 text-xs"
      />
      <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">
        Create
      </button>
    </form>
  );
}

function LibraryPage() {
  const [collectionId, setCollectionId] = useState<number | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([]);

  const currentParentId = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].id : null;

  const source: GridSource =
    collectionId !== null
      ? { type: "collection", id: collectionId }
      : { type: "library", tag, parentId: currentParentId };

  function selectLibrary() {
    setCollectionId(null);
    setTag(null);
    setBreadcrumb([]);
  }

  function selectCollection(id: number) {
    setCollectionId(id);
    setBreadcrumb([]);
  }

  function openFolder(id: number, title: string) {
    setBreadcrumb([...breadcrumb, { id, title }]);
  }

  function jumpToBreadcrumb(index: number) {
    // index -1 means "Root"
    setBreadcrumb(breadcrumb.slice(0, index + 1));
  }

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto flex max-w-6xl gap-6">
        <CollectionsSidebar
          activeCollectionId={collectionId}
          onSelectLibrary={selectLibrary}
          onSelectCollection={selectCollection}
        />

        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Media Server</h1>
            <RescanButton />
          </div>

          {source.type === "library" && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => jumpToBreadcrumb(-1)}
                    className={breadcrumb.length === 0 ? "text-foreground" : "hover:text-foreground"}
                  >
                    Root
                  </button>
                  {breadcrumb.map((crumb, i) => (
                    <span key={crumb.id} className="flex items-center gap-1">
                      <span>/</span>
                      <button
                        type="button"
                        onClick={() => jumpToBreadcrumb(i)}
                        className={i === breadcrumb.length - 1 ? "text-foreground" : "hover:text-foreground"}
                      >
                        {crumb.title}
                      </button>
                    </span>
                  ))}
                </div>
                <NewFolderButton parentId={currentParentId} />
              </div>

              <TagFilterBar selectedTag={tag} onSelect={setTag} />
            </>
          )}

          <MediaGrid source={source} onOpenFolder={openFolder} />
        </div>
      </div>
    </div>
  );
}

const rootRoute = createRootRoute();

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LibraryPage,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
