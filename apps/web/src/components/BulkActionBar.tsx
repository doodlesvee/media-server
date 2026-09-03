import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type Collection = { id: number; name: string; type: "manual" | "smart" };

async function fetchCollections(): Promise<{ collections: Collection[] }> {
  const res = await fetch("/api/collections");
  if (!res.ok) throw new Error(`Failed to load collections: ${res.status}`);
  return res.json();
}

// PUT /tags replaces an item's full tag set, so adding one tag to several
// items means merging with each item's existing tags first, not overwriting
// them — this fetches current tags per item before adding the new one.
async function addTagToItems(itemIds: number[], tagName: string): Promise<void> {
  for (const id of itemIds) {
    const res = await fetch(`/api/media-items/${id}`);
    if (!res.ok) continue;
    const item: { tags: { name: string }[] } = await res.json();
    const names = item.tags.map((t) => t.name);
    if (names.includes(tagName)) continue;

    await fetch(`/api/media-items/${id}/tags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagNames: [...names, tagName] }),
    });
  }
}

async function addItemsToCollection(itemIds: number[], collectionId: number): Promise<void> {
  for (const id of itemIds) {
    await fetch(`/api/collections/${collectionId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaItemId: id }),
    });
  }
}

export function BulkActionBar({
  selectedIds,
  onDone,
}: {
  selectedIds: number[];
  onDone: () => void;
}) {
  const [tagInput, setTagInput] = useState("");
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["collections"], queryFn: fetchCollections });

  // Deliberately doesn't call onDone() on success — a selection often needs
  // more than one action applied (tag it AND add it to a collection), so the
  // bar stays open until the user explicitly cancels/finishes.
  const tagMutation = useMutation({
    mutationFn: (tagName: string) => addTagToItems(selectedIds, tagName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-items"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setTagInput("");
    },
  });

  const collectionMutation = useMutation({
    mutationFn: (collectionId: number) => addItemsToCollection(selectedIds, collectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection-items"] });
    },
  });

  const manualCollections = data?.collections.filter((c) => c.type === "manual") ?? [];
  const isPending = tagMutation.isPending || collectionMutation.isPending;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-accent/50 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{selectedIds.length} selected</span>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (tagInput.trim()) tagMutation.mutate(tagInput.trim());
        }}
        className="flex items-center gap-1"
      >
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="Add tag…"
          className="rounded border border-border bg-transparent px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={isPending || !tagInput.trim()}
          className="rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          Apply
        </button>
      </form>

      {manualCollections.length > 0 && (
        <select
          defaultValue=""
          disabled={isPending}
          onChange={(e) => {
            if (e.target.value) collectionMutation.mutate(Number(e.target.value));
          }}
          className="rounded border border-border bg-transparent px-2 py-1 text-xs"
        >
          <option value="" disabled>
            Add to collection…
          </option>
          {manualCollections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        onClick={onDone}
        className="ml-auto text-xs text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}
