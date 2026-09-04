import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { appSettings } from "../db/schema.js";

export type HeroSource = "recent" | "favorites" | "manual";

export type HeroSettings = {
  source: HeroSource;
  /** Only meaningful when source is "manual"; order here is display order. */
  itemIds: number[];
};

const HERO_KEY = "hero";

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
  app.get("/api/settings", async () => ({ hero: await getHeroSettings() }));

  app.patch<{ Body: { hero?: Partial<HeroSettings> } }>(
    "/api/settings",
    async (request, reply) => {
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
