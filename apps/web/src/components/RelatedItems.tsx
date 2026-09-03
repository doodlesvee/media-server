import { useQuery } from "@tanstack/react-query";
import type { MediaCardItem } from "./MediaCard";
import { MediaRow } from "./MediaRow";

async function fetchRelated(id: number): Promise<{ items: MediaCardItem[] }> {
  const res = await fetch(`/api/media-items/${id}/related`);
  if (!res.ok) throw new Error(`Failed to load related items: ${res.status}`);
  return res.json();
}

function noopOpenFolder() {}

export function RelatedItems({
  itemId,
  onSelect,
}: {
  itemId: number;
  onSelect: (id: number) => void;
}) {
  const { data } = useQuery({
    queryKey: ["related-items", itemId],
    queryFn: () => fetchRelated(itemId),
  });

  // Folders have no meaningful "more like this" click target inside a modal,
  // so they're dropped rather than given a dead-end card.
  const items = (data?.items ?? []).filter((i) => i.itemType !== "folder");
  if (items.length === 0) return null;

  return (
    <div className="border-t border-border px-6 py-6">
      <MediaRow
        title="More Like This"
        items={items}
        onSelectItem={onSelect}
        onOpenFolder={noopOpenFolder}
      />
    </div>
  );
}
