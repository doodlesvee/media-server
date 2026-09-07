import { and, count, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import {
  collections,
  mediaFiles,
  mediaItems,
  mediaItemTypes,
  tags,
} from "../db/schema.js";

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/stats", async () => {
    const byType = await db
      .select({ type: mediaItemTypes.name, total: count() })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .where(eq(mediaItems.inScope, true))
      .groupBy(mediaItemTypes.name);

    // How much disk the library actually occupies. Summed over files rather
    // than items: an item is a row, and only a file has a size.
    //
    // Returned as a string and converted here on purpose — sum() over bigint
    // is numeric, which the pg driver hands back as a string to avoid silently
    // losing precision. Number() is safe at this magnitude (exact to 9PB) but
    // the cast should be visible rather than implied.
    const [totalSize] = await db
      .select({ bytes: sql<string>`coalesce(sum(${mediaFiles.sizeBytes}), 0)::bigint` })
      .from(mediaFiles)
      .innerJoin(mediaItems, eq(mediaItems.id, mediaFiles.mediaItemId))
      // Matches what the counts above report: a folder you stopped scanning
      // shouldn't still be adding terabytes to the total.
      .where(and(eq(mediaItems.inScope, true), isNull(mediaItems.missingSince)));

    const [{ total: tagCount }] = await db.select({ total: count() }).from(tags);
    const [{ total: collectionCount }] = await db.select({ total: count() }).from(collections);

    const counts = Object.fromEntries(byType.map((r) => [r.type, r.total]));

    return {
      videos: counts.video ?? 0,
      photos: counts.photo ?? 0,
      folders: counts.folder ?? 0,
      totalBytes: Number(totalSize?.bytes ?? 0),
      tags: tagCount,
      collections: collectionCount,
    };
  });
}
