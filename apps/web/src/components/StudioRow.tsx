import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ScrollRow } from "./ScrollRow";
import { StudioCard } from "./StudioCard";
import { fetchStudios } from "@/lib/studioApi";
import { pinsChangedEvent, readPins } from "@/lib/pinned";

/**
 * Studios, as a homepage row.
 *
 * Not in the sidebar: at this library's size studio is a weak browsing axis —
 * more than half have a single video — so it earns a row you scroll past, not
 * a permanent nav entry competing with Performers.
 *
 * Ordered by size rather than alphabetically, unlike the performers row: the
 * two studios holding most of the library are the only ones worth a click
 * from here, and alphabetical would bury them among the one-video entries.
 */
export function StudioRow() {
  const [, refreshPins] = useState(0);
  useEffect(() => {
    const refresh = () => refreshPins((value) => value + 1);
    window.addEventListener(pinsChangedEvent(), refresh);
    return () => window.removeEventListener(pinsChangedEvent(), refresh);
  }, []);
  const { data, isLoading } = useQuery({
    queryKey: ["studios"],
    queryFn: fetchStudios,
  });

  // The API deliberately keeps studios with no videos — one exists because a
  // filename named it — but there's nothing to show for them here.
  const studios = (data?.studios ?? [])
    .filter((s) => s.videoCount > 0)
    .sort(
      (a, b) =>
        Number(
          readPins().some(
            (pin) => pin.type === "studio" && pin.studioId === b.id,
          ),
        ) -
          Number(
            readPins().some(
              (pin) => pin.type === "studio" && pin.studioId === a.id,
            ),
          ) ||
        b.videoCount - a.videoCount ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );

  return (
    <ScrollRow title="Studios" itemCount={studios.length} loading={isLoading}>
      {isLoading
        ? // Wider tiles than the other rows, so fewer of them reach the edge.
          Array.from({ length: 5 }).map((_, index) => (
            <div
              key={`placeholder-${index}`}
              className="skeleton aspect-video w-64 shrink-0 rounded-lg sm:w-72"
            />
          ))
        : studios.map((studio) => (
            <StudioCard
              key={studio.id}
              studio={studio}
              className="w-64 shrink-0 sm:w-72"
            />
          ))}
    </ScrollRow>
  );
}
