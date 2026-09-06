import { MediaCard, type MediaCardItem } from "./MediaCard";
import { ScrollRow } from "./ScrollRow";

export function MediaRow({
  title,
  titleClassName,
  items,
  onSelectItem,
  onPlayItem,
  onOpenFolder,
}: {
  title: string;
  /** Passed straight through to ScrollRow; see the note there. */
  titleClassName?: string;
  items: MediaCardItem[];
  onSelectItem: (id: number) => void;
  onPlayItem?: (id: number) => void;
  onOpenFolder: (id: number, title: string) => void;
}) {
  return (
    <ScrollRow title={title} titleClassName={titleClassName} itemCount={items.length}>
      {items.map((item) => (
        <div key={item.id} className="w-60 shrink-0 sm:w-72 md:w-80">
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
