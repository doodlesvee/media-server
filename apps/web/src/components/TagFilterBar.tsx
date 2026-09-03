import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type Tag = { id: number; name: string };

async function fetchTags(): Promise<{ tags: Tag[] }> {
  const res = await fetch("/api/tags");
  if (!res.ok) throw new Error(`Failed to load tags: ${res.status}`);
  return res.json();
}

export function TagFilterBar({
  selectedTag,
  onSelect,
}: {
  selectedTag: string | null;
  onSelect: (tag: string | null) => void;
}) {
  const { data } = useQuery({ queryKey: ["tags"], queryFn: fetchTags });

  if (!data || data.tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {data.tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          onClick={() => onSelect(selectedTag === tag.name ? null : tag.name)}
          className={cn(
            "rounded-full border border-border px-3 py-1 text-xs hover:bg-accent",
            selectedTag === tag.name && "bg-primary text-primary-foreground"
          )}
        >
          {tag.name}
        </button>
      ))}
    </div>
  );
}
