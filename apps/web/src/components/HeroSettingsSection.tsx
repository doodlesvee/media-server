import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Search, X } from "lucide-react";
import type { MediaCardItem } from "./MediaCard";
import { fetchSettings, saveHeroSettings, type HeroSource } from "@/lib/settingsApi";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";

const SOURCES: { value: HeroSource; label: string; hint: string }[] = [
  { value: "manual", label: "Videos I pick", hint: "Only the ones you choose below, in this order." },
  { value: "favorites", label: "My favourites", hint: "Anything you've marked with the heart." },
  { value: "recent", label: "Recently added", hint: "The five newest videos in the library." },
];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function HeroSettingsSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });

  const [source, setSource] = useState<HeroSource>("recent");
  const [itemIds, setItemIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setSource(settings.hero.source);
    setItemIds(settings.hero.itemIds);
  }, [settings]);

  // One list request covers both the chosen titles and the pool to pick from
  // — a personal library sits well inside a single page.
  const { data: allItems } = useQuery({
    queryKey: ["media-items", "hero-picker"],
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>("/api/media-items?type=video"),
  });

  const byId = new Map((allItems?.items ?? []).map((i) => [i.id, i]));
  const chosen = itemIds.map((id) => byId.get(id)).filter((i): i is MediaCardItem => !!i);

  const term = search.trim().toLowerCase();
  const results = (allItems?.items ?? [])
    .filter((i) => !itemIds.includes(i.id))
    .filter((i) => (term ? i.title.toLowerCase().includes(term) : true))
    .slice(0, 8);

  const save = useMutation({
    mutationFn: () => saveHeroSettings({ source, itemIds }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["hero-items"] });
    },
  });

  const dirty =
    settings !== undefined &&
    (source !== settings.hero.source ||
      JSON.stringify(itemIds) !== JSON.stringify(settings.hero.itemIds));

  return (
    <section className="max-w-lg space-y-4 rounded-lg border border-border bg-card/40 p-5">
      <div className="space-y-1">
        <h2 className="font-semibold tracking-tight">Hero slider</h2>
        <p className="text-sm text-muted-foreground">
          Which videos rotate through the banner at the top of the home page.
        </p>
      </div>

      <div className="space-y-2">
        {SOURCES.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
              source === option.value
                ? "border-white/40 bg-secondary"
                : "border-border hover:bg-accent/50"
            )}
          >
            <input
              type="radio"
              name="hero-source"
              checked={source === option.value}
              onChange={() => {
                setSource(option.value);
                setSaved(false);
              }}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {source === "manual" && (
        <div className="space-y-3 rounded-md border border-border p-3">
          {chosen.length > 0 ? (
            <ul className="space-y-1.5">
              {chosen.map((item, index) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  <span className="w-4 shrink-0 text-xs text-muted-foreground">{index + 1}</span>
                  <img
                    src={thumbnailUrl(item)}
                    alt=""
                    className="h-8 w-14 shrink-0 rounded object-cover"
                  />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setItemIds(itemIds.filter((id) => id !== item.id));
                      setSaved(false);
                    }}
                    aria-label={`Remove ${item.title} from the hero`}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nothing picked yet — the hero stays hidden until you add something.
            </p>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search videos to add…"
              className="w-full rounded-md border border-border bg-secondary/60 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-ring/60"
            />
          </div>

          {results.length > 0 && (
            <ul className="max-h-52 space-y-1 overflow-y-auto">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setItemIds([...itemIds, item.id]);
                      setSearch("");
                      setSaved(false);
                    }}
                    className="flex w-full items-center gap-2 rounded p-1 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <img
                      src={thumbnailUrl(item)}
                      alt=""
                      className="h-8 w-14 shrink-0 rounded object-cover"
                    />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {saved && !dirty && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Check className="size-3.5" />
          Saved
        </p>
      )}

      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={!dirty || save.isPending}
        className="flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
      >
        {save.isPending && <Loader2 className="size-4 animate-spin" />}
        Save hero
      </button>
    </section>
  );
}
