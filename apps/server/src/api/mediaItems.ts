import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { mediaItemTags, mediaItems, mediaItemTypes, tags } from "../db/schema.js";
import { playbackWarningFor } from "../media/compatibility.js";

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

async function fetchTagsByItemIds(
  itemIds: number[]
): Promise<Map<number, { id: number; name: string; color: string | null }[]>> {
  if (itemIds.length === 0) return new Map();

  const rows = await db
    .select({
      mediaItemId: mediaItemTags.mediaItemId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(mediaItemTags)
    .innerJoin(tags, eq(tags.id, mediaItemTags.tagId))
    .where(inArray(mediaItemTags.mediaItemId, itemIds));

  const map = new Map<number, { id: number; name: string; color: string | null }[]>();
  for (const row of rows) {
    const list = map.get(row.mediaItemId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    map.set(row.mediaItemId, list);
  }
  return map;
}

function withComputedFields<T extends { id: number; itemType: string; extraMetadata: unknown }>(
  item: T,
  tagsByItemId: Map<number, { id: number; name: string; color: string | null }[]>
) {
  return {
    ...item,
    playbackWarning: playbackWarningFor(
      item.itemType,
      item.extraMetadata as Record<string, unknown> | null
    ),
    tags: tagsByItemId.get(item.id) ?? [],
  };
}

export async function mediaItemRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: { libraryId?: string; type?: string; tag?: string; parentId?: string; page?: string };
  }>("/api/media-items", async (request) => {
      const { libraryId, type, tag, parentId, page } = request.query;
      const pageNum = Math.max(1, Number(page) || 1);

      const conditions: SQL[] = [];
      if (libraryId) {
        conditions.push(eq(mediaItems.libraryId, Number(libraryId)));
      }
      if (type) {
        conditions.push(eq(mediaItemTypes.name, type));
      }
      if (tag) {
        const matchingItemIds = db
          .select({ id: mediaItemTags.mediaItemId })
          .from(mediaItemTags)
          .innerJoin(tags, eq(tags.id, mediaItemTags.tagId))
          .where(eq(tags.name, tag));
        conditions.push(inArray(mediaItems.id, matchingItemIds));
      } else {
        // With no tag filter, default to the current folder level (root when
        // parentId is omitted) so nested items don't leak into the top view.
        // A tag search deliberately ignores folder nesting — tags are the
        // global organizing mechanism, you shouldn't have to drill into
        // folders to find a tagged item.
        conditions.push(parentId ? eq(mediaItems.parentId, Number(parentId)) : isNull(mediaItems.parentId));
      }

      const query = db
        .select(itemColumns)
        .from(mediaItems)
        .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id));

      const rows = await (conditions.length > 0 ? query.where(and(...conditions)) : query)
        .limit(PAGE_SIZE)
        .offset((pageNum - 1) * PAGE_SIZE);

      const tagsByItemId = await fetchTagsByItemIds(rows.map((r) => r.id));

      return {
        items: rows.map((r) => withComputedFields(r, tagsByItemId)),
        page: pageNum,
        pageSize: PAGE_SIZE,
      };
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
    const tagsByItemId = await fetchTagsByItemIds([id]);
    return withComputedFields(item, tagsByItemId);
  });

  app.patch<{
    Params: { id: string };
    Body: { parentId?: number | null; title?: string; description?: string | null };
  }>("/api/media-items/:id", async (request, reply) => {
    const id = Number(request.params.id);
    const { parentId, title, description } = request.body;

    if (parentId === id) {
      reply.code(400);
      return { error: "An item cannot be its own parent" };
    }
    if (title !== undefined && !title.trim()) {
      reply.code(400);
      return { error: "title cannot be empty" };
    }

    const patch: Partial<typeof mediaItems.$inferInsert> = { updatedAt: new Date() };
    if (parentId !== undefined) patch.parentId = parentId;
    if (title !== undefined) patch.title = title.trim();
    if (description !== undefined) patch.description = description;

    const updated = await db
      .update(mediaItems)
      .set(patch)
      .where(eq(mediaItems.id, id))
      .returning();

    if (updated.length === 0) {
      reply.code(404);
      return { error: "Not found" };
    }
    return { ok: true };
  });
}
