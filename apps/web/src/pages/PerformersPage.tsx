import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  PerformerCard,
  type PerformerSummary,
} from "@/components/PerformerCard";
import { AlphabetIndex } from "@/components/AlphabetIndex";
import { pinsChangedEvent, readPins } from "@/lib/pinned";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function PerformersPage() {
  const navigate = useNavigate();
  const [letter, setLetter] = useState<string | null>(null);
  const [, refreshPins] = useState(0);

  useEffect(() => {
    const refresh = () => refreshPins((value) => value + 1);
    window.addEventListener(pinsChangedEvent(), refresh);
    return () => window.removeEventListener(pinsChangedEvent(), refresh);
  }, []);

  const { data } = useQuery({
    queryKey: ["performers"],
    queryFn: () =>
      fetchJson<{ performers: PerformerSummary[] }>("/api/performers"),
  });

  // Favourites first, then alphabetical — so a performer stays put as their
  // video count changes; ordering by count meant every scan could reshuffle
  // the whole page. localeCompare so accented names sort next to their base
  // letter. The server orders the same way, but this page re-sorts anyway, so
  // the pin has to be repeated here or it would be thrown away.
  const pinnedIds = new Set(
    readPins()
      .filter((pin) => pin.type === "performer")
      .map((pin) => pin.performerId),
  );
  const performers = [...(data?.performers ?? [])].sort(
    (a, b) =>
      Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id)) ||
      Number(b.isFavorite) - Number(a.isFavorite) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  // Unlike the homepage row, zero-video performers are kept: this is the page
  // where you'd go to find one you created by hand, or one whose folder is
  // currently unscanned.
  // Favourited performers get their own section at the top, so they're
  // excluded from the two below rather than appearing twice.
  const visiblePerformers = letter
    ? performers.filter((performer) => {
        const initial = performer.name.trim().charAt(0).toUpperCase();
        return letter === "#" ? !/^[A-Z]$/.test(initial) : initial === letter;
      })
    : performers;
  const visibleFavorites = visiblePerformers.filter((p) => p.isFavorite);
  const visibleWithVideos = visiblePerformers.filter(
    (p) => !p.isFavorite && p.videoCount > 0,
  );
  const visibleEmpty = visiblePerformers.filter(
    (p) => !p.isFavorite && p.videoCount === 0,
  );

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
        <AlphabetIndex
          value={letter}
          onChange={setLetter}
          available={performers.map((performer) => performer.name)}
        />
        {visiblePerformers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No performers yet. They're created automatically from your folder
            names when you scan.
          </p>
        )}

        {visibleFavorites.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              <Heart className="size-3.5 fill-red-500 text-red-500" />
              Favourites
            </h2>
            <div className="stagger flex flex-wrap gap-x-6 gap-y-7">
              {visibleFavorites.map((performer) => (
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

        {visibleWithVideos.length > 0 && (
          <div className="stagger flex flex-wrap gap-x-6 gap-y-7">
            {visibleWithVideos.map((performer) => (
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

        {visibleEmpty.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">
              No videos right now
            </h2>
            <p className="max-w-prose text-xs text-muted-foreground/70">
              Either added by hand, or their folder isn't currently being
              scanned. Their details are kept either way.
            </p>
            <div className="stagger flex flex-wrap gap-x-6 gap-y-7">
              {visibleEmpty.map((performer) => (
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
