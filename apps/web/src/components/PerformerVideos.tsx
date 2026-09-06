import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MediaGrid } from "./MediaGrid";
import { MediaRow } from "./MediaRow";
import type { MediaCardItem } from "./MediaCard";
import type { PerformerDetail } from "@/lib/performerApi";
import { cn } from "@/lib/utils";

type Grouping = "studio" | "year" | "none";

const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: "studio", label: "Studio" },
  { value: "year", label: "Year" },
  { value: "none", label: "All" },
];

async function fetchItems(params: URLSearchParams): Promise<{ items: MediaCardItem[] }> {
  const res = await fetch(`/api/media-items?${params}`);
  if (!res.ok) throw new Error(`Failed to load videos: ${res.status}`);
  return res.json();
}

/**
 * One group's videos, fetched through the same filters the rest of the app
 * uses — so each section is paginated by the server rather than the whole
 * collection being pulled down and sliced in the browser.
 */
function VideoSection({
  title,
  performer,
  params,
  onSelect,
}: {
  title: string;
  performer: string;
  params: Record<string, string>;
  onSelect: (id: number, autoPlay: boolean) => void;
}) {
  const query = new URLSearchParams({ performer, ...params });
  const { data } = useQuery({
    queryKey: ["performer-videos", performer, params],
    queryFn: () => fetchItems(query),
  });

  return (
    <MediaRow
      title={title}
      // Larger than a home-page row: on a profile these headings are how the
      // page is structured, not just a label above a strip.
      titleClassName="text-xl font-semibold tracking-tight sm:text-2xl"
      items={data?.items ?? []}
      onSelectItem={(id) => onSelect(id, false)}
      onPlayItem={(id) => onSelect(id, true)}
      onOpenFolder={() => {}}
    />
  );
}

/**
 * A performer's videos, grouped by whichever dimension you pick.
 *
 * Studio is the default because that is how files are filed. "All" falls back
 * to the plain grid, which keeps its own Sort and Year controls — grouping
 * replaces those views rather than competing with them.
 *
 * The choice is component state rather than a URL parameter: it's a viewing
 * preference, and putting it in the URL would mean threading it through the
 * router's search validation for no real gain.
 */
export function PerformerVideos({
  performer,
  onSelect,
}: {
  performer: PerformerDetail;
  onSelect: (id: number, autoPlay: boolean) => void;
}) {
  const [grouping, setGrouping] = useState<Grouping>("studio");

  // A performer with nothing to group by would get a single meaningless
  // section, so offer grouping only where it says something.
  const realStudios = performer.studios.filter((s) => s.name !== null);
  const realYears = performer.years.filter((y) => y.year !== null);
  const canGroup = { studio: realStudios.length > 1, year: realYears.length > 1, none: true };
  const effective: Grouping = canGroup[grouping] ? grouping : "none";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Group by</span>
        {GROUPINGS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setGrouping(option.value)}
            disabled={!canGroup[option.value]}
            aria-pressed={effective === option.value}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs transition-colors",
              effective === option.value
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
              !canGroup[option.value] && "cursor-not-allowed opacity-40 hover:bg-transparent"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {effective === "studio" &&
        performer.studios.map((group) => (
          <VideoSection
            key={group.name ?? "__none__"}
            title={group.name ?? "No studio"}
            performer={performer.name}
            // The null bucket needs its own filter, or those videos would be
            // missing from the page entirely.
            params={group.name ? { studio: group.name } : { noStudio: "true" }}
            onSelect={onSelect}
          />
        ))}

      {effective === "year" &&
        performer.years.map((group) => (
          <VideoSection
            key={group.year ?? "__none__"}
            title={group.year ? String(group.year) : "No date"}
            performer={performer.name}
            params={group.year ? { year: String(group.year) } : { noYear: "true" }}
            onSelect={onSelect}
          />
        ))}

      {effective === "none" && (
        <MediaGrid
          source={{
            type: "library",
            tag: null,
            performer: performer.name,
            studio: null,
            kind: null,
            q: null,
            parentId: null,
          }}
          onOpenFolder={() => {}}
        />
      )}
    </div>
  );
}
