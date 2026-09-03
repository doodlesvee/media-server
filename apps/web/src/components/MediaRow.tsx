import { MediaCard, type MediaCardItem } from "./MediaCard";
import { ScrollRow } from "./ScrollRow";

export function MediaRow({
  title,
  items,
  onSelectItem,
  onPlayItem,
  onOpenFolder,
}: {
  title: string;
  items: MediaCardItem[];
  onSelectItem: (id: number) => void;
  onPlayItem?: (id: number) => void;
  onOpenFolder: (id: number, title: string) => void;
}) {
  return (
    <ScrollRow title={title} itemCount={items.length}>
      {items.map((item) => (
        <div key={item.id} className="w-36 shrink-0 sm:w-44 md:w-52">
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
