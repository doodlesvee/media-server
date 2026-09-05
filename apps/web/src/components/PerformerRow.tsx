import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { PerformerCard, type PerformerSummary } from "./PerformerCard";
import { ScrollRow } from "./ScrollRow";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function PerformerRow() {
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["performers"],
    queryFn: () => fetchJson<{ performers: PerformerSummary[] }>("/api/performers"),
  });

  // The API deliberately returns performers with no videos — you can create
  // one ahead of the files arriving — but there's nothing to show for them
  // here, so the row filters them out rather than the endpoint.
  const performers = (data?.performers ?? [])
    .filter((p) => p.videoCount > 0)
    // Alphabetical here too, matching the Performers page — the same list in
    // two orders on two screens is worse than either order on its own.
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return (
    <ScrollRow title="Performers" itemCount={performers.length}>
      {performers.map((performer) => (
        <PerformerCard
          key={performer.id}
          performer={performer}
          onClick={() =>
            void navigate({
              to: "/performer/$performerId",
              params: { performerId: String(performer.id) },
            })
          }
        />
      ))}
    </ScrollRow>
  );
}
