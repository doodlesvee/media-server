import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { updateItem, type MediaItemDetail } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";

/**
 * Five stars, set in one click.
 *
 * Clicking the rating an item already has clears it, rather than there being
 * a separate "clear" control — the same gesture people reach for on every
 * other star widget, and it keeps this to one row of five targets.
 *
 * Not gated behind the sheet's edit mode, for the same reason the favourite
 * heart is not: a rating is a state you set while watching, not metadata you
 * sit down to correct.
 */
export function StarRating({
  itemId,
  rating,
  size = "sm",
}: {
  itemId: number;
  rating: number | null;
  size?: "sm" | "md";
}) {
  const queryClient = useQueryClient();
  const [hovered, setHovered] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: (next: number | null) => updateItem(itemId, { rating: next }),
    // Optimistic: a star that lights up a round trip after the click reads
    // as a missed click, and you click it again.
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ["media-item", itemId] });
      const previous = queryClient.getQueryData<MediaItemDetail>(["media-item", itemId]);
      if (previous) {
        queryClient.setQueryData<MediaItemDetail>(["media-item", itemId], {
          ...previous,
          rating: next,
        });
      }
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["media-item", itemId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["media-item", itemId] });
      // Rating sorts and filters live in the grid queries.
      queryClient.invalidateQueries({ queryKey: ["media-items"] });
    },
  });

  const shown = hovered ?? rating ?? 0;
  const iconSize = size === "md" ? "size-5" : "size-4";

  return (
    <span
      role="radiogroup"
      aria-label="Rating"
      className="inline-flex items-center"
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((stars) => (
        <button
          key={stars}
          type="button"
          role="radio"
          aria-checked={rating === stars}
          aria-label={`${stars} star${stars === 1 ? "" : "s"}`}
          title={rating === stars ? "Clear rating" : `Rate ${stars}`}
          onMouseEnter={() => setHovered(stars)}
          onClick={() => mutation.mutate(rating === stars ? null : stars)}
          className="p-0.5 transition-transform hover:scale-110"
        >
          <Star
            className={cn(
              iconSize,
              "transition-colors",
              stars <= shown
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/50",
            )}
          />
        </button>
      ))}
    </span>
  );
}
