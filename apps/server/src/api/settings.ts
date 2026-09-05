import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { appSettings } from "../db/schema.js";
import { restartScanSchedule } from "../scanner/schedule.js";

export type HeroSource = "recent" | "favorites" | "manual";

export type HeroSettings = {
  source: HeroSource;
  /** Only meaningful when source is "manual"; order here is display order. */
  itemIds: number[];
};

const HERO_KEY = "hero";
const KIND_COVERS_KEY = "kindCovers";
const SCAN_KEY = "scan";

// Minutes between automatic scans. 0 means off. Kept as an allow-list rather
// than a free number so a hand-edited row can't set a 10-second interval and
// leave the scanner permanently busy.
export const SCAN_INTERVALS = [0, 5, 15, 30, 60, 180] as const;

export type ScanSettings = { intervalMinutes: number };

const DEFAULT_SCAN: ScanSettings = { intervalMinutes: 15 };

export async function getScanSettings(): Promise<ScanSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SCAN_KEY));
  const value = row?.value as Partial<ScanSettings> | null;
  const minutes = value?.intervalMinutes;
  // Re-validated on read, same discipline as the hero settings.
  return SCAN_INTERVALS.includes(minutes as (typeof SCAN_INTERVALS)[number])
    ? { intervalMinutes: minutes as number }
    : DEFAULT_SCAN;
}

export async function setScanSettings(intervalMinutes: number): Promise<ScanSettings> {
  const value: ScanSettings = SCAN_INTERVALS.includes(
    intervalMinutes as (typeof SCAN_INTERVALS)[number]
  )
    ? { intervalMinutes }
    : DEFAULT_SCAN;

  await db
    .insert(appSettings)
    .values({ key: SCAN_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  return value;
}

/** Uploaded cover filename per category, when one has been set. */
export type KindCovers = Partial<Record<string, string>>;

export async function getKindCovers(): Promise<KindCovers> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KIND_COVERS_KEY));
  const value = row?.value as KindCovers | null;
  if (!value || typeof value !== "object") return {};
  return value;
}

export async function setKindCover(kind: string, fileName: string | null): Promise<KindCovers> {
  const current = await getKindCovers();
  const next: KindCovers = { ...current };
  if (fileName) next[kind] = fileName;
  else delete next[kind];

  await db
    .insert(appSettings)
    .values({ key: KIND_COVERS_KEY, value: next })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: next, updatedAt: new Date() },
    });
  return next;
}

const DEFAULT_HERO: HeroSettings = { source: "recent", itemIds: [] };

const HERO_SOURCES: HeroSource[] = ["recent", "favorites", "manual"];

export async function getHeroSettings(): Promise<HeroSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, HERO_KEY));
  if (!row) return DEFAULT_HERO;

  // Stored values are jsonb the app wrote, but a hand-edited row shouldn't be
  // able to break the homepage, so everything is re-validated on read.
  const value = row.value as Partial<HeroSettings> | null;
  const source = HERO_SOURCES.includes(value?.source as HeroSource)
    ? (value!.source as HeroSource)
    : DEFAULT_HERO.source;
  const itemIds = Array.isArray(value?.itemIds)
    ? value!.itemIds.filter((id): id is number => Number.isInteger(id))
    : [];

  return { source, itemIds };
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/settings", async () => ({
    hero: await getHeroSettings(),
    scan: await getScanSettings(),
    scanIntervals: SCAN_INTERVALS,
  }));

  app.patch<{ Body: { hero?: Partial<HeroSettings>; scan?: Partial<ScanSettings> } }>(
    "/api/settings",
    async (request, reply) => {
      if (request.body.scan?.intervalMinutes !== undefined) {
        const scan = await setScanSettings(request.body.scan.intervalMinutes);
        // Applied immediately rather than at next boot — changing the interval
        // and having nothing happen for an hour would read as broken.
        await restartScanSchedule();
        return { scan };
      }

      const incoming = request.body.hero;
      if (!incoming) {
        reply.code(400);
        return { error: "Nothing to update" };
      }

      const current = await getHeroSettings();
      const source = HERO_SOURCES.includes(incoming.source as HeroSource)
        ? (incoming.source as HeroSource)
        : current.source;
      const itemIds = Array.isArray(incoming.itemIds)
        ? [...new Set(incoming.itemIds.filter((id) => Number.isInteger(id)))]
        : current.itemIds;

      const value: HeroSettings = { source, itemIds };

      await db
        .insert(appSettings)
        .values({ key: HERO_KEY, value })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value, updatedAt: new Date() },
        });

      return { hero: value };
    }
  );
}

/** Ids to feature, in display order — empty means "fall back to recent". */
export async function heroItemIds(): Promise<number[] | null> {
  const hero = await getHeroSettings();
  if (hero.source !== "manual") return null;
  return hero.itemIds;
}

export { inArray };
