import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, EyeOff, Heart, HeartOff, Tag, X } from "lucide-react";
import { useToast } from "@/lib/toast";
import { summariseBulk, type BulkResult } from "@/lib/bulkSummary";
import {
  addItemsToCollection,
  removeItemsFromCollection,
  setFavoriteOnItems,
  setTagOnItems,
  setWatchedOnItems,
} from "@/lib/bulkActions";

type Collection = { id: number; name: string; type: "manual" | "smart" };

async function fetchCollections(): Promise<{ collections: Collection[] }> {
  const res = await fetch("/api/collections");
  if (!res.ok) throw new Error(`Failed to load collections: ${res.status}`);
  return res.json();
}

/** Shared shape for the icon buttons, so the row reads as one control set. */
const actionButtonClass =
  "flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50";

export function BulkActionBar({
  selectedIds,
  onDone,
  onSelectAll,
  totalCount,
  /**
   * Set when the grid is showing one manual collection, which is the only
   * context where "remove from this collection" means anything specific.
   * Elsewhere there is no "this" to remove from.
   */
  collectionId,
}: {
  selectedIds: number[];
  onDone: () => void;
  onSelectAll?: () => void;
  totalCount?: number;
  collectionId?: number;
}) {
  const [tagInput, setTagInput] = useState("");
  const queryClient = useQueryClient();
  const { toast, update } = useToast();
  const { data } = useQuery({
    queryKey: ["collections"],
    queryFn: fetchCollections,
  });

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

    return run((done) =>
      update(toastId, { description: `${done} of ${total}` }),
    ).then(
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

  /**
   * Every surface that can show one of these items has to repaint.
   *
   * Broader than each individual action strictly needs, and deliberately so:
   * a bulk run touches favourites, watch state and collection membership in
   * whatever combination the user clicked, and working out the minimal set
   * per action is how a stale Continue Watching row survives a "mark
   * watched" on forty items.
   */
  function refreshEverything() {
    for (const key of [
      ["media-items"],
      ["media-item"],
      ["collection-items"],
      ["continue-watching"],
      ["stats"],
      ["tags"],
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  }

  // Deliberately doesn't call onDone() on success — a selection often needs
  // more than one action applied (tag it AND add it to a collection), so the
  // bar stays open until the user explicitly cancels/finishes.
  const tagMutation = useMutation({
    mutationFn: ({ name, present }: { name: string; present: boolean }) =>
      runBulk(
        present ? "Tagging" : "Removing tag",
        present ? "Tagged" : "Untagged",
        (onProgress) => setTagOnItems(selectedIds, name, present, onProgress),
      ),
    onSuccess: () => {
      refreshEverything();
      setTagInput("");
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: (isFavorite: boolean) =>
      runBulk(
        isFavorite ? "Favouriting" : "Unfavouriting",
        isFavorite ? "Favourited" : "Unfavourited",
        (onProgress) => setFavoriteOnItems(selectedIds, isFavorite, onProgress),
      ),
    onSuccess: refreshEverything,
  });

  const watchedMutation = useMutation({
    mutationFn: (watched: boolean) =>
      runBulk(
        watched ? "Marking watched" : "Marking unwatched",
        watched ? "Marked watched" : "Marked unwatched",
        (onProgress) => setWatchedOnItems(selectedIds, watched, onProgress),
      ),
    onSuccess: refreshEverything,
  });

  const collectionMutation = useMutation({
    mutationFn: ({ id, add }: { id: number; add: boolean }) =>
      runBulk(
        add ? "Adding to collection" : "Removing from collection",
        add ? "Added" : "Removed",
        (onProgress) =>
          add
            ? addItemsToCollection(selectedIds, id, onProgress)
            : removeItemsFromCollection(selectedIds, id, onProgress),
      ),
    onSuccess: refreshEverything,
  });

  const manualCollections =
    data?.collections.filter((c) => c.type === "manual") ?? [];
  const isPending =
    tagMutation.isPending ||
    favoriteMutation.isPending ||
    watchedMutation.isPending ||
    collectionMutation.isPending;

  return (
    <div
      role="toolbar"
      aria-label="Actions for the selected items"
      className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-md border border-border bg-accent/50 px-3 py-2 text-sm backdrop-blur-md"
    >
      <span className="text-muted-foreground">
        {selectedIds.length} selected
      </span>

      {onSelectAll && totalCount !== undefined && selectedIds.length < totalCount && (
        <button
          type="button"
          onClick={onSelectAll}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Select all {totalCount}
        </button>
      )}

      <span aria-hidden className="mx-1 h-4 w-px bg-border" />

      <button
        type="button"
        disabled={isPending}
        onClick={() => favoriteMutation.mutate(true)}
        className={actionButtonClass}
      >
        <Heart className="size-3.5" /> Favourite
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => favoriteMutation.mutate(false)}
        className={actionButtonClass}
      >
        <HeartOff className="size-3.5" /> Unfavourite
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => watchedMutation.mutate(true)}
        className={actionButtonClass}
      >
        <Eye className="size-3.5" /> Watched
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => watchedMutation.mutate(false)}
        className={actionButtonClass}
      >
        <EyeOff className="size-3.5" /> Unwatched
      </button>

      <span aria-hidden className="mx-1 h-4 w-px bg-border" />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (tagInput.trim())
            tagMutation.mutate({ name: tagInput.trim(), present: true });
        }}
        className="flex items-center gap-1"
      >
        <label className="sr-only" htmlFor="bulk-tag">
          Tag name
        </label>
        <Tag className="size-3.5 text-muted-foreground" />
        <input
          id="bulk-tag"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="Tag name…"
          className="w-28 rounded border border-border bg-transparent px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={isPending || !tagInput.trim()}
          className={actionButtonClass}
          title="Add this tag to every selected item"
        >
          <Check className="size-3.5" /> Add
        </button>
        <button
          type="button"
          disabled={isPending || !tagInput.trim()}
          onClick={() =>
            tagMutation.mutate({ name: tagInput.trim(), present: false })
          }
          className={actionButtonClass}
          title="Remove this tag from every selected item"
        >
          <X className="size-3.5" /> Remove
        </button>
      </form>

      {manualCollections.length > 0 && (
        <>
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          <select
            aria-label="Add the selection to a collection"
            value=""
            disabled={isPending}
            onChange={(e) => {
              if (e.target.value)
                collectionMutation.mutate({
                  id: Number(e.target.value),
                  add: true,
                });
              // Reset so picking the same collection twice in a row fires
              // again — a controlled empty value never "changes" otherwise.
              e.target.value = "";
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
        </>
      )}

      {collectionId !== undefined && (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            collectionMutation.mutate({ id: collectionId, add: false })
          }
          className={actionButtonClass}
        >
          <X className="size-3.5" /> Remove from this collection
        </button>
      )}

      <button
        type="button"
        onClick={onDone}
        className="ml-auto text-xs text-muted-foreground hover:text-foreground"
      >
        Done
      </button>
    </div>
  );
}
