import { MediaCard, type MediaCardItem } from "./MediaCard";
import { ScrollRow } from "./ScrollRow";
import { tileWidthPx, useAppearance } from "@/lib/appearance";
import { cardLayout } from "@/lib/layout";

export function MediaRow({
  title,
  titleClassName,
  itemClassName,
  action,
  items,
  loading = false,
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
  /**
   * Holds the row open with placeholder tiles while its query is in flight.
   * Without it the row is simply absent until the data lands, so the home page
   * shuffles itself as each request returns.
   */
  loading?: boolean;
  onSelectItem: (id: number) => void;
  onPlayItem?: (id: number) => void;
  onOpenFolder: (id: number, title: string) => void;
}) {
  const { tileSizePercent, tileInfo, viewMode, density } = useAppearance();
  // Same derivation the grid uses, so a row and the grid below it agree about
  // how big a card is instead of drifting apart mode by mode.
  const layout = cardLayout(
    tileWidthPx(tileSizePercent),
    viewMode,
    density,
    tileInfo,
  );
  const tileWidth = layout.widthPx;
  // About what a wide row shows at the default tile size — enough to read as a
  // full row, few enough that the last ones aren't wasted work off-screen.
  const placeholderCount = 6;

  // Same width rule and aspect as a real tile, so nothing shifts when the
  // placeholders are replaced by the cards themselves.
  const tileStyle = itemClassName
    ? undefined
    : { width: `min(${tileWidth}px, 80vw)` };

  return (
    <ScrollRow
      title={title}
      titleClassName={titleClassName}
      action={action}
      itemCount={items.length}
      loading={loading}
    >
      {loading
        ? Array.from({ length: placeholderCount }).map((_, index) => (
            <div
              key={`placeholder-${index}`}
              className={itemClassName ?? "shrink-0"}
              style={tileStyle}
            >
              <div
                className="skeleton w-full rounded-md"
                style={{ aspectRatio: layout.aspectRatio }}
              />
            </div>
          ))
        : items.map((item) => (
            <div
              key={item.id}
              className={itemClassName ?? "shrink-0"}
              // min() rather than a flat width: on a phone a 416px tile would
              // be wider than the screen, and the row would scroll one tile at
              // a time.
              style={tileStyle}
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
