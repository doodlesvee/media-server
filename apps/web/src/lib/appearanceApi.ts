import type { Appearance } from "./appearance";

/** The server stores a partial: only what's been changed from the defaults. */
export type StoredAppearance = Partial<Appearance>;

export async function fetchAppearance(): Promise<StoredAppearance> {
  const res = await fetch("/api/appearance");
  if (!res.ok) throw new Error(`Failed to load appearance: ${res.status}`);
  return ((await res.json()) as { appearance: StoredAppearance }).appearance;
}

export async function saveAppearance(patch: StoredAppearance): Promise<void> {
  const res = await fetch("/api/appearance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to save appearance: ${res.status}`);
}
