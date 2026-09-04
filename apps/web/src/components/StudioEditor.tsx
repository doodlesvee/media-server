import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateItem } from "@/lib/mediaItemApi";

/**
 * Studio for one item. Read-only until the modal is in edit mode, matching
 * how tags and performers behave.
 */
export function StudioEditor({
  itemId,
  studio,
  readOnly = false,
}: {
  itemId: number;
  studio: string | null;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(studio ?? "");
  const queryClient = useQueryClient();

  useEffect(() => setValue(studio ?? ""), [studio]);

  const mutation = useMutation({
    mutationFn: (next: string) => updateItem(itemId, { studio: next || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-item", itemId] });
      queryClient.invalidateQueries({ queryKey: ["media-items"] });
      queryClient.invalidateQueries({ queryKey: ["studios"] });
    },
  });

  if (readOnly) {
    return studio ? (
      <span className="text-sm text-foreground/90">{studio}</span>
    ) : (
      <span className="text-xs text-muted-foreground/60">—</span>
    );
  }

  function save() {
    // Saving hands the field over permanently, so don't do it for a no-op.
    if (value.trim() === (studio ?? "")) return;
    mutation.mutate(value.trim());
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      placeholder="Add studio…"
      className="w-full border-b border-border bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
    />
  );
}
