import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/lib/toast";
import { summariseBulk, type BulkResult } from "@/lib/bulkSummary";

type Collection = { id: number; name: string; type: "manual" | "smart" };

async function fetchCollections(): Promise<{ collections: Collection[] }> {
  const res = await fetch("/api/collections");
  if (!res.ok) throw new Error(`Failed to load collections: ${res.status}`);
  return res.json();
}

// PUT /tags replaces an item's full tag set, so adding one tag to several
// items means merging with each item's existing tags first, not overwriting
// them — this fetches current tags per item before adding the new one.
//
// Requests stay sequential: this points at a self-hosted box, and forty
// parallel read-then-write pairs is a worse neighbour than forty in a row.
async function addTagToItems(
  itemIds: number[],
  tagName: string,
  onProgress: (done: number) => void,
): Promise<BulkResult> {
  const result: BulkResult = { ok: 0, failed: 0, skipped: 0 };

  for (const [index, id] of itemIds.entries()) {
    try {
      const res = await fetch(`/api/media-items/${id}`);
      if (!res.ok) {
        result.failed += 1;
        continue;
      }
      const item: { tags: { name: string }[] } = await res.json();
      const names = item.tags.map((t) => t.name);
      if (names.includes(tagName)) {
        result.skipped += 1;
        continue;
      }

      const saved = await fetch(`/api/media-items/${id}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagNames: [...names, tagName] }),
      });
      if (saved.ok) result.ok += 1;
      else result.failed += 1;
    } catch {
      // A dropped connection mid-run is a failure for this item only.
      result.failed += 1;
    } finally {
      onProgress(index + 1);
    }
  }

  return result;
}

async function addItemsToCollection(
  itemIds: number[],
  collectionId: number,
  onProgress: (done: number) => void,
): Promise<BulkResult> {
  const result: BulkResult = { ok: 0, failed: 0, skipped: 0 };

  for (const [index, id] of itemIds.entries()) {
    try {
      const res = await fetch(`/api/collections/${collectionId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaItemId: id }),
      });
      if (res.ok) result.ok += 1;
      else result.failed += 1;
    } catch {
      result.failed += 1;
    } finally {
      onProgress(index + 1);
    }
  }

  return result;
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
  const { toast, update } = useToast();
  const { data } = useQuery({ queryKey: ["collections"], queryFn: fetchCollections });

  // A bulk run is one request per item, so on a large selection it is slow
  // enough to look hung. The toast is opened before the work starts, updated
  // as it goes, and resolved in place — one row start to finish, rather than
  // a pile of them.
  function runBulk(
    label: string,
    doneVerb: string,
    run: (onProgress: (done: number) => void) => Promise<BulkResult>,
  ): Promise<BulkResult> {
    const total = selectedIds.length;
    const toastId = toast({
      title: label,
      description: `0 of ${total}`,
      duration: null,
    });

    return run((done) => update(toastId, { description: `${done} of ${total}` })).then(
      (result) => {
        update(toastId, {
          title: result.failed > 0 ? `${label} finished with errors` : "Done",
          description: summariseBulk(result, doneVerb),
          variant: result.failed > 0 ? "error" : "success",
        });
        return result;
      },
      (error: unknown) => {
        update(toastId, {
          title: `${label} failed`,
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "error",
        });
        throw error;
      },
    );
  }

  // Deliberately doesn't call onDone() on success — a selection often needs
  // more than one action applied (tag it AND add it to a collection), so the
  // bar stays open until the user explicitly cancels/finishes.
  const tagMutation = useMutation({
    mutationFn: (tagName: string) =>
      runBulk("Tagging", "Tagged", (onProgress) =>
        addTagToItems(selectedIds, tagName, onProgress),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-items"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setTagInput("");
    },
  });

  const collectionMutation = useMutation({
    mutationFn: (collectionId: number) =>
      runBulk("Adding to collection", "Added", (onProgress) =>
        addItemsToCollection(selectedIds, collectionId, onProgress),
      ),
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
