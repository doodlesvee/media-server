import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { PerformerCard, type PerformerSummary } from "@/components/PerformerCard";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function PerformersPage() {
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["performers"],
    queryFn: () => fetchJson<{ performers: PerformerSummary[] }>("/api/performers"),
  });

  // Alphabetical, so a performer stays put as their video count changes —
  // ordering by count meant every scan could reshuffle the whole page.
  // localeCompare so accented names sort next to their base letter.
  const performers = [...(data?.performers ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  // Unlike the homepage row, zero-video performers are kept: this is the page
  // where you'd go to find one you created by hand, or one whose folder is
  // currently unscanned.
  const withVideos = performers.filter((p) => p.videoCount > 0);
  const empty = performers.filter((p) => p.videoCount === 0);

  return (
    <AppShell
      title="Performers"
      subtitle={
        performers.length > 0
          ? `${performers.length} ${performers.length === 1 ? "performer" : "performers"}`
          : undefined
      }
    >
      <div className="space-y-8 px-6 py-8">
        {performers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No performers yet. They're created automatically from your folder names when you
            scan.
          </p>
        )}

        {withVideos.length > 0 && (
          <div className="stagger flex flex-wrap gap-x-6 gap-y-7">
            {withVideos.map((performer) => (
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
          </div>
        )}

        {empty.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">
              No videos right now
            </h2>
            <p className="max-w-prose text-xs text-muted-foreground/70">
              Either added by hand, or their folder isn't currently being scanned. Their
              details are kept either way.
            </p>
            <div className="stagger flex flex-wrap gap-x-6 gap-y-7">
              {empty.map((performer) => (
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
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
