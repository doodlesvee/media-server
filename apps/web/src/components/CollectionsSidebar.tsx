import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreateCollectionModal } from "./CreateCollectionModal";

type Collection = { id: number; name: string; type: "manual" | "smart" };

async function fetchCollections(): Promise<{ collections: Collection[] }> {
  const res = await fetch("/api/collections");
  if (!res.ok) throw new Error(`Failed to load collections: ${res.status}`);
  return res.json();
}

async function deleteCollection(id: number) {
  const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete collection: ${res.status}`);
}

export function CollectionsSidebar({
  activeCollectionId,
  onSelectLibrary,
  onSelectCollection,
}: {
  activeCollectionId: number | null;
  onSelectLibrary: () => void;
  onSelectCollection: (id: number) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["collections"], queryFn: fetchCollections });

  const deleteMutation = useMutation({
    mutationFn: deleteCollection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["collections"] }),
  });

  return (
    <div className="w-48 shrink-0 space-y-4">
      <button
        type="button"
        onClick={onSelectLibrary}
        className={cn(
          "w-full rounded-md px-2 py-1 text-left text-sm hover:bg-accent",
          activeCollectionId === null && "bg-accent"
        )}
      >
        All Media
      </button>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          Collections
          <button type="button" onClick={() => setShowCreate(true)} aria-label="New collection">
            <Plus className="size-3.5" />
          </button>
        </div>
        <div className="space-y-0.5">
          {data?.collections.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-accent",
                activeCollectionId === c.id && "bg-accent"
              )}
            >
              <button
                type="button"
                onClick={() => onSelectCollection(c.id)}
                className="flex-1 truncate text-left"
              >
                {c.name}
                {c.type === "smart" && (
                  <span className="ml-1 text-xs text-muted-foreground">(smart)</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(c.id)}
                className="hidden group-hover:block"
                aria-label={`Delete ${c.name}`}
              >
                <Trash2 className="size-3.5 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {showCreate && <CreateCollectionModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
