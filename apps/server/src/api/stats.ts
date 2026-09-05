import { count, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { collections, mediaItems, mediaItemTypes, tags } from "../db/schema.js";

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/stats", async () => {
    const byType = await db
      .select({ type: mediaItemTypes.name, total: count() })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .where(eq(mediaItems.inScope, true))
      .groupBy(mediaItemTypes.name);

    const [{ total: tagCount }] = await db.select({ total: count() }).from(tags);
    const [{ total: collectionCount }] = await db.select({ total: count() }).from(collections);

    const counts = Object.fromEntries(byType.map((r) => [r.type, r.total]));

    return {
      videos: counts.video ?? 0,
      photos: counts.photo ?? 0,
      folders: counts.folder ?? 0,
      tags: tagCount,
      collections: collectionCount,
    };
  });
}
