import { and, eq, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { mediaItems, mediaItemTypes } from "../db/schema.js";
import { playbackWarningFor } from "../media/compatibility.js";

function withPlaybackWarning<T extends { itemType: string; extraMetadata: unknown }>(
  item: T
): T & { playbackWarning: string | null } {
  return {
    ...item,
    playbackWarning: playbackWarningFor(
      item.itemType,
      item.extraMetadata as Record<string, unknown> | null
    ),
  };
}

const PAGE_SIZE = 50;

const itemColumns = {
  id: mediaItems.id,
  libraryId: mediaItems.libraryId,
  parentId: mediaItems.parentId,
  itemType: mediaItemTypes.name,
  title: mediaItems.title,
  description: mediaItems.description,
  durationSeconds: mediaItems.durationSeconds,
  takenAt: mediaItems.takenAt,
  extraMetadata: mediaItems.extraMetadata,
  missingSince: mediaItems.missingSince,
  createdAt: mediaItems.createdAt,
  updatedAt: mediaItems.updatedAt,
};

export async function mediaItemRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { libraryId?: string; type?: string; page?: string } }>(
    "/api/media-items",
    async (request) => {
      const { libraryId, type, page } = request.query;
      const pageNum = Math.max(1, Number(page) || 1);

      const conditions: SQL[] = [];
      if (libraryId) {
        conditions.push(eq(mediaItems.libraryId, Number(libraryId)));
      }
      if (type) {
        conditions.push(eq(mediaItemTypes.name, type));
      }

      const query = db
        .select(itemColumns)
        .from(mediaItems)
        .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id));

      const rows = await (conditions.length > 0 ? query.where(and(...conditions)) : query)
        .limit(PAGE_SIZE)
        .offset((pageNum - 1) * PAGE_SIZE);

      return { items: rows.map(withPlaybackWarning), page: pageNum, pageSize: PAGE_SIZE };
    }
  );

  app.get<{ Params: { id: string } }>("/api/media-items/:id", async (request, reply) => {
    const id = Number(request.params.id);
    const [item] = await db
      .select(itemColumns)
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .where(eq(mediaItems.id, id));
    if (!item) {
      reply.code(404);
      return { error: "Not found" };
    }
    return withPlaybackWarning(item);
  });
}
