import { useEffect, useState } from "react";
import { MediaRow } from "./MediaRow";
import { ROW_TILE_LIMIT } from "@/lib/rowLimits";
import type { MediaCardItem } from "./MediaCard";
import {
  readRecent,
  readRecentlyInteracted,
  recentChangedEvent,
  type RecentEntry,
  type RecentKind,
} from "@/lib/recent";

/**
 * A row backed by local interaction history rather than a request (§3).
 *
 * The entries carry enough to draw a tile — id, title, thumbnail token,
 * duration — so the row paints immediately and makes no API call at all.
 * Fetching each item to fill in the rest would be a request per tile for
 * fields the tile does not show, which §31 is explicit about avoiding.
 *
 * It re-reads on the change event because the history is written from
 * anywhere in the app; without it, browsing an item and returning home would
 * show the row as it was when the page mounted.
 */
export function RecentRow({
  title,
  kind,
  onSelectItem,
  onPlayItem,
}: {
  title: string;
  /** "interacted" merges every kind; the rest read one list. */
  kind: RecentKind | "interacted";
  onSelectItem: (id: number) => void;
  onPlayItem: (id: number) => void;
}) {
  const read = () =>
    kind === "interacted" ? readRecentlyInteracted() : readRecent(kind);
  const [entries, setEntries] = useState<RecentEntry[]>(read);

  useEffect(() => {
    const refresh = () => setEntries(read());
    refresh();
    window.addEventListener(recentChangedEvent(), refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(recentChangedEvent(), refresh);
      window.removeEventListener("storage", refresh);
    };
    // `read` closes over `kind` and nothing else, so the listener only has to
    // be rebuilt when the kind changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // An empty row is hidden rather than shown empty, like every other row.
  if (entries.length === 0) return null;

  const items: MediaCardItem[] = entries
    .slice(0, ROW_TILE_LIMIT)
    .map((entry) => ({
      id: entry.id,
      // Always a video: only videos are recorded, and a tile needs a type to
      // decide whether it can be played.
      itemType: "video",
      title: entry.title,
      durationSeconds: entry.durationSeconds ?? null,
      missingSince: null,
      thumbnailFile: entry.thumbnailFile,
    }));

  return (
    <MediaRow
      title={title}
      items={items}
      loading={false}
      onSelectItem={onSelectItem}
      onPlayItem={onPlayItem}
      onOpenFolder={() => {}}
    />
  );
}
