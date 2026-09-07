import { MediaCard, type MediaCardItem } from "./MediaCard";
import { ScrollRow } from "./ScrollRow";
import { tileWidthPx, useAppearance } from "@/lib/appearance";

export function MediaRow({
  title,
  titleClassName,
  itemClassName,
  action,
  items,
  onSelectItem,
  onPlayItem,
  onOpenFolder,
}: {
  title: string;
  /** Passed straight through to ScrollRow; see the note there. */
  titleClassName?: string;
  /**
   * Escape hatch for a row that genuinely needs a different tile. Left unset,
   * every row takes its width from the Appearance panel, so one size is
   * shared by the whole app.
   */
  itemClassName?: string;
  /** Passed straight through to ScrollRow; see the note there. */
  action?: React.ReactNode;
  items: MediaCardItem[];
  onSelectItem: (id: number) => void;
  onPlayItem?: (id: number) => void;
  onOpenFolder: (id: number, title: string) => void;
}) {
  const { tileSizePercent } = useAppearance();
  const tileWidth = tileWidthPx(tileSizePercent);

  return (
    <ScrollRow title={title} titleClassName={titleClassName} action={action} itemCount={items.length}>
      {items.map((item) => (
        <div
          key={item.id}
          className={itemClassName ?? "shrink-0"}
          // min() rather than a flat width: on a phone a 416px tile would be
          // wider than the screen, and the row would scroll one tile at a time.
          style={itemClassName ? undefined : { width: `min(${tileWidth}px, 80vw)` }}
        >
          <MediaCard
            item={item}
            onClick={() =>
              item.itemType === "folder"
                ? onOpenFolder(item.id, item.title)
                : onSelectItem(item.id)
            }
            onPlay={onPlayItem ? () => onPlayItem(item.id) : undefined}
          />
        </div>
      ))}
    </ScrollRow>
  );
}
