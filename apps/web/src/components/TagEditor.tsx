import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { saveTags, type Tag } from "@/lib/mediaItemApi";

export function TagEditor({ itemId, tags }: { itemId: number; tags: Tag[] }) {
  const [pending, setPending] = useState<string[]>(tags.map((t) => t.name));
  const [input, setInput] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    setPending(tags.map((t) => t.name));
  }, [tags]);

  const mutation = useMutation({
    mutationFn: (tagNames: string[]) => saveTags(itemId, tagNames),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["media-items"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["collection-items"] });
    },
  });

  const dirty = JSON.stringify([...pending].sort()) !== JSON.stringify(tags.map((t) => t.name).sort());

  function addTag() {
    const name = input.trim();
    if (name && !pending.includes(name)) {
      setPending([...pending, name]);
    }
    setInput("");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pending.map((name) => (
        <span
          key={name}
          className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary"
        >
          {name}
          <button
            type="button"
            onClick={() => setPending(pending.filter((n) => n !== name))}
            aria-label={`Remove tag ${name}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag();
          }
        }}
        placeholder="Add tag…"
        className="w-24 border-b border-border bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
      />
      {dirty && (
        <button
          type="button"
          onClick={() => mutation.mutate(pending)}
          disabled={mutation.isPending}
          className="rounded bg-secondary px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-50"
        >
          Save
        </button>
      )}
    </div>
  );
}
