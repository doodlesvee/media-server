import { and, desc, eq, gt, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import {
  mediaItemPerformers,
  mediaItemTags,
  mediaItems,
  mediaItemTypes,
  performers,
  playbackStates,
  tags,
} from "../db/schema.js";
import { playbackWarningFor } from "../media/compatibility.js";

const PAGE_SIZE = 50;
const RELATED_LIMIT = 8;

const itemColumns = {
  id: mediaItems.id,
  libraryId: mediaItems.libraryId,
  parentId: mediaItems.parentId,
  itemType: mediaItemTypes.name,
  title: mediaItems.title,
  titleSource: mediaItems.titleSource,
  description: mediaItems.description,
  performersSource: mediaItems.performersSource,
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

async function fetchPerformersByItemIds(
  itemIds: number[]
): Promise<Map<number, { id: number; name: string }[]>> {
  if (itemIds.length === 0) return new Map();

  const rows = await db
    .select({
      mediaItemId: mediaItemPerformers.mediaItemId,
      id: performers.id,
      name: performers.name,
    })
    .from(mediaItemPerformers)
    .innerJoin(performers, eq(performers.id, mediaItemPerformers.performerId))
    .where(inArray(mediaItemPerformers.mediaItemId, itemIds));

  const map = new Map<number, { id: number; name: string }[]>();
  for (const row of rows) {
    const list = map.get(row.mediaItemId) ?? [];
    list.push({ id: row.id, name: row.name });
    map.set(row.mediaItemId, list);
  }
  return map;
}

type RelatedMaps = {
  tagsByItemId: Map<number, { id: number; name: string; color: string | null }[]>;
  performersByItemId: Map<number, { id: number; name: string }[]>;
};

/**
 * Both side-lookups for a page of items, in parallel — so adding performers
 * costs no extra wall-clock time over fetching tags alone. Passed around as
 * one object rather than two arguments so a call site can't supply one and
 * silently forget the other.
 */
async function fetchRelated(itemIds: number[]): Promise<RelatedMaps> {
  const [tagsByItemId, performersByItemId] = await Promise.all([
    fetchTagsByItemIds(itemIds),
    fetchPerformersByItemIds(itemIds),
  ]);
  return { tagsByItemId, performersByItemId };
}

function withComputedFields<T extends { id: number; itemType: string; extraMetadata: unknown }>(
  item: T,
  related: RelatedMaps
) {
  return {
    ...item,
    playbackWarning: playbackWarningFor(
      item.itemType,
      item.extraMetadata as Record<string, unknown> | null
    ),
    tags: related.tagsByItemId.get(item.id) ?? [],
    performers: related.performersByItemId.get(item.id) ?? [],
  };
}

export async function mediaItemRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      libraryId?: string;
      type?: string;
      tag?: string;
      performer?: string;
      parentId?: string;
      q?: string;
      page?: string;
    };
  }>("/api/media-items", async (request) => {
    const { libraryId, type, tag, performer, parentId, q, page } = request.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const search = q?.trim();

    const conditions: SQL[] = [];
    if (libraryId) {
      conditions.push(eq(mediaItems.libraryId, Number(libraryId)));
    }
    if (type) {
      conditions.push(eq(mediaItemTypes.name, type));
    }
    if (search) {
      const match = or(
        ilike(mediaItems.title, `%${search}%`),
        ilike(mediaItems.description, `%${search}%`)
      );
      if (match) conditions.push(match);
    }
    if (tag) {
      const matchingItemIds = db
        .select({ id: mediaItemTags.mediaItemId })
        .from(mediaItemTags)
        .innerJoin(tags, eq(tags.id, mediaItemTags.tagId))
        .where(eq(tags.name, tag));
      conditions.push(inArray(mediaItems.id, matchingItemIds));
    }
    if (performer) {
      const matchingItemIds = db
        .select({ id: mediaItemPerformers.mediaItemId })
        .from(mediaItemPerformers)
        .innerJoin(performers, eq(performers.id, mediaItemPerformers.performerId))
        // lower(...) = lower(...) rather than eq, so a hand-typed
        // ?performer=alice still resolves, and rather than ilike, which would
        // treat `_` in a name as a wildcard.
        .where(sql`lower(${performers.name}) = lower(${performer})`);
      conditions.push(inArray(mediaItems.id, matchingItemIds));
    }
    // With no global filter, default to the current folder level (root when
    // parentId is omitted) so nested items don't leak into the top view. Tag,
    // performer and search all deliberately ignore folder nesting — they're
    // global lookups, you shouldn't have to drill into folders to hit them.
    if (!tag && !performer && !search) {
      conditions.push(
        parentId ? eq(mediaItems.parentId, Number(parentId)) : isNull(mediaItems.parentId)
      );
    }

    const query = db
      .select({ ...itemColumns, lastPositionSeconds: playbackStates.positionSeconds })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .leftJoin(playbackStates, eq(playbackStates.mediaItemId, mediaItems.id));

    const rows = await (conditions.length > 0 ? query.where(and(...conditions)) : query)
      .orderBy(desc(mediaItems.createdAt))
      .limit(PAGE_SIZE)
      .offset((pageNum - 1) * PAGE_SIZE);

    const related = await fetchRelated(rows.map((r) => r.id));

    return {
      items: rows.map((r) => ({
        ...withComputedFields(r, related),
        lastPositionSeconds: r.lastPositionSeconds ?? 0,
      })),
      page: pageNum,
      pageSize: PAGE_SIZE,
    };
  });

  // Backs the "Continue Watching" row — anything with real progress that
  // isn't essentially finished, most recently watched first.
  app.get("/api/continue-watching", async () => {
    const rows = await db
      .select({ ...itemColumns, lastPositionSeconds: playbackStates.positionSeconds })
      .from(playbackStates)
      .innerJoin(mediaItems, eq(mediaItems.id, playbackStates.mediaItemId))
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .where(gt(playbackStates.positionSeconds, 15))
      .orderBy(desc(playbackStates.updatedAt))
      .limit(RELATED_LIMIT);

    const related = await fetchRelated(rows.map((r) => r.id));
    return {
      items: rows.map((r) => ({
        ...withComputedFields(r, related),
        lastPositionSeconds: r.lastPositionSeconds ?? 0,
      })),
    };
  });

  app.get<{ Params: { id: string } }>("/api/media-items/:id", async (request, reply) => {
    const id = Number(request.params.id);
    const [item] = await db
      .select({ ...itemColumns, lastPositionSeconds: playbackStates.positionSeconds })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .leftJoin(playbackStates, eq(playbackStates.mediaItemId, mediaItems.id))
      .where(eq(mediaItems.id, id));
    if (!item) {
      reply.code(404);
      return { error: "Not found" };
    }
    const related = await fetchRelated([id]);
    return { ...withComputedFields(item, related), lastPositionSeconds: item.lastPositionSeconds ?? 0 };
  });

  // "More like this": no external metadata to compare against, so
  // relatedness means shared tags — the user's own organizing signal —
  // falling back to folder siblings for an untagged item.
  app.get<{ Params: { id: string } }>("/api/media-items/:id/related", async (request, reply) => {
    const id = Number(request.params.id);

    const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    if (!item) {
      reply.code(404);
      return { error: "Not found" };
    }

    const ownTagIds = (
      await db
        .select({ tagId: mediaItemTags.tagId })
        .from(mediaItemTags)
        .where(eq(mediaItemTags.mediaItemId, id))
    ).map((r) => r.tagId);

    const baseQuery = db
      .select(itemColumns)
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id));

    let rows: Awaited<ReturnType<typeof baseQuery.where>> = [];

    if (ownTagIds.length > 0) {
      const relatedIds = db
        .selectDistinct({ id: mediaItemTags.mediaItemId })
        .from(mediaItemTags)
        .where(inArray(mediaItemTags.tagId, ownTagIds));

      rows = await baseQuery
        .where(and(inArray(mediaItems.id, relatedIds), ne(mediaItems.id, id)))
        .orderBy(desc(mediaItems.createdAt))
        .limit(RELATED_LIMIT);
    }

    // Fall back on empty *results*, not just on an untagged item — an item
    // whose tags nobody else shares would otherwise get a blank row.
    if (rows.length === 0) {
      rows = await baseQuery
        .where(
          and(
            item.parentId === null
              ? isNull(mediaItems.parentId)
              : eq(mediaItems.parentId, item.parentId),
            ne(mediaItems.id, id),
            ne(mediaItemTypes.name, "folder")
          )
        )
        .orderBy(desc(mediaItems.createdAt))
        .limit(RELATED_LIMIT);
    }

    const related = await fetchRelated(rows.map((r) => r.id));
    return { items: rows.map((r) => withComputedFields(r, related)) };
  });

  app.patch<{
    Params: { id: string };
    Body: {
      parentId?: number | null;
      title?: string;
      description?: string | null;
    };
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
    if (title !== undefined) {
      patch.title = title.trim();
      // From here on the scanner leaves this title alone, even across renames.
      patch.titleSource = "user";
    }
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
