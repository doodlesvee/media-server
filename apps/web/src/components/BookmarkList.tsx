import { useState } from "react";
import { Bookmark as BookmarkIcon, Trash2 } from "lucide-react";
import { formatTimestamp, useBookmarkMutations, type Bookmark } from "@/lib/bookmarkApi";
import { useMediaQuery } from "@/lib/useMediaQuery";

/**
 * The video's bookmarks, as a table of contents.
 *
 * A label is renamed in place: click it, type, Enter or click away. There is
 * no separate edit mode, because a bookmark is usually made mid-watch with no
 * label and named later, and a mode would turn that into three clicks.
 */
export function BookmarkList({
  itemId,
  bookmarks,
  onJump,
}: {
  itemId: number;
  bookmarks: Bookmark[];
  onJump: (seconds: number) => void;
}) {
  const { rename, remove } = useBookmarkMutations(itemId);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const touch = useMediaQuery("(pointer: coarse)");

  if (bookmarks.length === 0) {
    if (touch) {
      return (
        <p className="text-xs text-muted-foreground">
          None yet. Tap the bookmark button on the video to mark a moment.
        </p>
      );
    }
    return (
      <p className="text-xs text-muted-foreground">
        None yet. Press <kbd className="rounded border border-border px-1 font-mono text-[10px]">B</kbd>{" "}
        while playing, or the bookmark button on the video, to mark a moment.
      </p>
    );
  }

  function commit(bookmark: Bookmark) {
    setEditingId(null);
    if (draft.trim() !== (bookmark.label ?? "")) {
      rename.mutate({ id: bookmark.id, label: draft });
    }
  }

  return (
    <ol className="space-y-1">
      {bookmarks.map((bookmark) => (
        <li key={bookmark.id} className="group flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => onJump(bookmark.positionSeconds)}
            title="Play from here"
            className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-xs tabular-nums text-amber-500 transition-colors hover:bg-accent"
          >
            <BookmarkIcon className="size-3 fill-current" />
            {formatTimestamp(bookmark.positionSeconds)}
          </button>

          {editingId === bookmark.id ? (
            <input
              autoFocus
              value={draft}
              maxLength={200}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(bookmark)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit(bookmark);
                if (e.key === "Escape") {
                  // Cancels the rename only — without this the player's own
                  // Escape handler closes the whole sheet.
                  e.stopPropagation();
                  setEditingId(null);
                }
              }}
              placeholder="Name this moment"
              className="min-w-0 flex-1 rounded border border-border bg-transparent px-2 py-0.5 text-xs outline-none focus:border-ring/60"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(bookmark.label ?? "");
                setEditingId(bookmark.id);
              }}
              title="Rename"
              className="sensitive min-w-0 flex-1 truncate text-left text-xs text-muted-foreground hover:text-foreground"
            >
              {bookmark.label ?? <span className="italic opacity-60">Untitled</span>}
            </button>
          )}

          <button
            type="button"
            onClick={() => remove.mutate(bookmark.id)}
            aria-label={`Delete bookmark at ${formatTimestamp(bookmark.positionSeconds)}`}
            title="Delete"
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100 max-md:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </li>
      ))}
    </ol>
  );
}
