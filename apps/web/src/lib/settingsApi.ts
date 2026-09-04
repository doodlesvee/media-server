export type HeroSource = "recent" | "favorites" | "manual";
export type HeroSettings = { source: HeroSource; itemIds: number[] };
export type AppSettings = { hero: HeroSettings };

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error(`Failed to load settings: ${res.status}`);
  return res.json();
}

export async function saveHeroSettings(hero: HeroSettings): Promise<AppSettings> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hero }),
  });
  if (!res.ok) throw new Error(`Failed to save settings: ${res.status}`);
  return res.json();
}
