import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { appSettings } from "../db/schema.js";

const APPEARANCE_KEY = "appearance";

/**
 * How the app looks, stored per install rather than per browser.
 *
 * These began in localStorage, which meant a different tile size in Safari
 * than in Chrome and nothing at all on a second machine. The server is the
 * single copy; the browser still keeps one so a reload paints immediately
 * instead of flashing the defaults.
 *
 * Validated here as well as in the client, because "the client already
 * checked" is never a reason for a server to store whatever it's handed.
 * Anything unrecognised is dropped rather than rejected — an older browser
 * sending a key this build no longer has shouldn't fail the whole save.
 */

const PERCENT_KEYS = {
  tileSizePercent: [40, 100],
  bannerHeight: [30, 100],
  discreetBlurPercent: [10, 100],
} as const;

const BOOLEAN_KEYS = ["hoverZoom", "hoverPreview", "discreet", "discreetText"] as const;

const TILE_INFO = ["full", "title", "none"];

const HOME_ROW_KEYS = [
  "categories",
  "continue",
  "favourites",
  "performers",
  "studios",
  "recent",
  "collections",
  "tags",
];

function clean(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const body = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, [min, max]] of Object.entries(PERCENT_KEYS)) {
    const value = body[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = Math.min(max, Math.max(min, Math.round(value)));
    }
  }

  for (const key of BOOLEAN_KEYS) {
    if (typeof body[key] === "boolean") out[key] = body[key];
  }

  if (typeof body.tileInfo === "string" && TILE_INFO.includes(body.tileInfo)) {
    out.tileInfo = body.tileInfo;
  }

  if (Array.isArray(body.homeRows)) {
    const seen = new Set<string>();
    const rows: { key: string; visible: boolean }[] = [];
    for (const entry of body.homeRows) {
      const key = (entry as { key?: unknown })?.key;
      if (typeof key !== "string" || !HOME_ROW_KEYS.includes(key) || seen.has(key)) continue;
      seen.add(key);
      rows.push({ key, visible: (entry as { visible?: unknown }).visible !== false });
    }
    if (rows.length > 0) out.homeRows = rows;
  }

  return out;
}

export async function appearanceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/appearance", async () => {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, APPEARANCE_KEY));
    // An empty object means "never set" — the client fills in its own
    // defaults rather than the server having a second opinion about them.
    return { appearance: clean(row?.value) };
  });

  app.put<{ Body: Record<string, unknown> }>("/api/appearance", async (request) => {
    // Merged, not replaced: a client that predates a setting would otherwise
    // wipe it by saving without it.
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, APPEARANCE_KEY));
    const value = { ...clean(row?.value), ...clean(request.body) };

    await db
      .insert(appSettings)
      .values({ key: APPEARANCE_KEY, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
    return { appearance: value };
  });
}
