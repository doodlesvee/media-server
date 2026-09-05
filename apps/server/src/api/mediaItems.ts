import { and, asc, desc, eq, gt, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import {
  categories,
  mediaFiles,
  mediaItemPerformers,
  mediaItemTags,
  mediaItems,
  mediaItemTypes,
  performers,
  playbackStates,
  studios,
  tags,
} from "../db/schema.js";
import { playbackWarningFor } from "../media/compatibility.js";
import { getHeroSettings, getKindCovers, setKindCover } from "./settings.js";
import { deleteKindCover, kindCoverPath, saveKindCover } from "../media/kindCovers.js";
import { streamFile } from "../media/streamer.js";

const PAGE_SIZE = 50;

// Anything that reads back a video's watch state selects these together, so a
// query can't accidentally return the position without the watched flag.
const playbackColumns = {
  lastPositionSeconds: playbackStates.positionSeconds,
  watchedAt: playbackStates.completedAt,
  playCount: playbackStates.playCount,
};

// How much of a video counts as "finished". Credits, black frames and a
// stray click near the end all mean the last few percent often never play,
// so waiting for a true 100% would leave things in Continue Watching forever.
//
// Held as a whole percent, and compared by cross-multiplying rather than
// dividing, so the comparison stays integer-only. A fractional 0.92 bound
// into `duration_seconds * $n` made Postgres infer the parameter's type from
// the integer column it multiplies and reject the query outright.
const WATCHED_PERCENT = 92;

/**
 * Sort orders offered to the grid. Every one ends with the item id as a
 * tiebreaker: a scan inserts many rows at the same clock instant, and paging
 * with OFFSET over a non-unique sort duplicates rows on one page and skips
 * them on the next.
 */
export const SORTS = ["newest", "oldest", "title", "longest", "shortest"] as const;
export type Sort = (typeof SORTS)[number];

function orderFor(sort: string | undefined): SQL[] {
  switch (sort) {
    case "oldest":
      return [asc(mediaItems.createdAt), asc(mediaItems.id)];
    case "title":
      return [sql`lower(${mediaItems.title}) asc`, asc(mediaItems.id)];
    // Folders have no duration at all, and Postgres sorts NULLs first on
    // DESC — without NULLS LAST they'd head up the "longest" list.
    case "longest":
      return [sql`${mediaItems.durationSeconds} desc nulls last`, desc(mediaItems.id)];
    case "shortest":
      return [sql`${mediaItems.durationSeconds} asc nulls last`, asc(mediaItems.id)];
    default:
      return [desc(mediaItems.createdAt), desc(mediaItems.id)];
  }
}

/** Rounds into range, falling back to the low bound for a non-numeric value. */
function clampPercent(value: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.round(Math.max(min, Math.min(max, n)));
}

// `%` and `_` are LIKE wildcards, and a filename legitimately contains both.
// Unescaped, searching for `Scene_01` would also match `Scene-01`.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const RELATED_LIMIT = 8;
const HERO_LIMIT = 5;

/**
 * The category slugs that currently exist.
 *
 * This used to be a hardcoded `["video", "movie", "series"]`. Categories then
 * became user-editable data, and the constant didn't follow — so every
 * category you created yourself failed validation. In the listing query that
 * was silent and destructive: an unrecognised kind meant the filter was never
 * added *and* folder scoping was suppressed, so the tile returned the entire
 * library instead of its own items.
 */
async function categorySlugs(): Promise<Set<string>> {
  const rows = await db.select({ slug: categories.slug }).from(categories);
  return new Set(rows.map((r) => r.slug));
}

const itemColumns = {
  id: mediaItems.id,
  libraryId: mediaItems.libraryId,
  parentId: mediaItems.parentId,
  itemType: mediaItemTypes.name,
  title: mediaItems.title,
  titleSource: mediaItems.titleSource,
  description: mediaItems.description,
  performersSource: mediaItems.performersSource,
  isFavorite: mediaItems.isFavorite,
  kind: mediaItems.kind,
  studio: studios.name,
  studioSource: mediaItems.studioSource,
  thumbnailFile: mediaItems.thumbnailFile,
  thumbnailPositionX: mediaItems.thumbnailPositionX,
  thumbnailPositionY: mediaItems.thumbnailPositionY,
  thumbnailScale: mediaItems.thumbnailScale,
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

/**
 * Adds the watch state on top of the computed fields, normalising the nulls a
 * LEFT JOIN produces for anything never played.
 */
function withPlayback<
  T extends {
    id: number;
    itemType: string;
    extraMetadata: unknown;
    lastPositionSeconds: number | null;
    watchedAt: Date | null;
    playCount: number | null;
  },
>(row: T, related: RelatedMaps) {
  return {
    ...withComputedFields(row, related),
    lastPositionSeconds: row.lastPositionSeconds ?? 0,
    watchedAt: row.watchedAt ?? null,
    watched: row.watchedAt != null,
    playCount: row.playCount ?? 0,
  };
}

/** Conflict-tolerant so concurrent saves of a new studio name can't collide. */
async function ensureStudioId(rawName: string): Promise<number> {
  const name = rawName.normalize("NFC").replace(/\s+/g, " ").trim();

  const findId = async (): Promise<number | null> => {
    const [row] = await db
      .select({ id: studios.id })
      .from(studios)
      .where(sql`lower(${studios.name}) = lower(${name})`);
    return row?.id ?? null;
  };

  const existing = await findId();
  if (existing !== null) return existing;

  const [created] = await db.insert(studios).values({ name }).onConflictDoNothing().returning();
  if (created) return created.id;

  const raced = await findId();
  if (raced === null) throw new Error(`Could not resolve studio "${name}"`);
  return raced;
}

export async function mediaItemRoutes(app: FastifyInstance): Promise<void> {
  // Backs the category tiles on the home page.
  app.get("/api/kinds", async () => {
    const rows = await db
      .select({
        kind: mediaItems.kind,
        total: sql<number>`count(*)::int`,
        // Newest item of that kind, for the tile's backdrop.
        representativeItemId: sql<number | null>`max(${mediaItems.id})`,
      })
      .from(mediaItems)
      .where(eq(mediaItems.inScope, true))
      .groupBy(mediaItems.kind);

    const byKind = new Map(rows.map((r) => [r.kind, r]));
    const covers = await getKindCovers();
    const slugs = [...(await categorySlugs())];
    return {
      kinds: slugs.map((kind) => ({
        kind,
        total: byKind.get(kind)?.total ?? 0,
        representativeItemId: byKind.get(kind)?.representativeItemId ?? null,
        // Folded into the URL so replacing a cover changes it, letting the
        // response be cached hard.
        cover: covers[kind] ? `/api/kinds/${kind}/cover?v=${covers[kind]}` : null,
      })),
    };
  });

  app.get<{ Params: { kind: string } }>("/api/kinds/:kind/cover", async (request, reply) => {
    const covers = await getKindCovers();
    const fileName = covers[request.params.kind];
    if (!fileName) {
      reply.code(404);
      return { error: "No cover" };
    }
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    await streamFile(reply, kindCoverPath(fileName), "image/jpeg", undefined, false);
  });

  app.post<{ Params: { kind: string } }>("/api/kinds/:kind/cover", async (request, reply) => {
    const kind = request.params.kind;
    if (!(await categorySlugs()).has(kind)) {
      reply.code(400);
      return { error: "Unknown category" };
    }

    const upload = await request.file();
    if (!upload) {
      reply.code(400);
      return { error: "No file uploaded" };
    }

    let buffer: Buffer;
    try {
      buffer = await upload.toBuffer();
    } catch {
      reply.code(413);
      return { error: "Image is too large" };
    }

    let fileName: string;
    try {
      fileName = await saveKindCover(buffer, kind);
    } catch {
      reply.code(400);
      return { error: "That file could not be read as an image" };
    }

    const previous = (await getKindCovers())[kind];
    await setKindCover(kind, fileName);
    // Only after the setting points at the new file, so a failure here leaves
    // a stray file rather than a broken reference.
    await deleteKindCover(previous);

    return { ok: true };
  });

  app.delete<{ Params: { kind: string } }>("/api/kinds/:kind/cover", async (request, reply) => {
    const kind = request.params.kind;
    if (!(await categorySlugs()).has(kind)) {
      reply.code(400);
      return { error: "Unknown category" };
    }
    const previous = (await getKindCovers())[kind];
    await setKindCover(kind, null);
    await deleteKindCover(previous);
    return { ok: true };
  });

  app.get("/api/studios", async () => {
    const rows = await db
      .select({
        id: studios.id,
        name: studios.name,
        // count(<column>) not count(*): a LEFT JOIN with no match would
        // otherwise report 1 for a studio with nothing attached.
        videoCount: sql<number>`count(${mediaItems.id})::int`,
      })
      .from(studios)
      .leftJoin(mediaItems, and(eq(mediaItems.studioId, studios.id), eq(mediaItems.inScope, true)))
      .groupBy(studios.id, studios.name)
      .orderBy(sql`lower(${studios.name})`);
    return { studios: rows };
  });

  app.get<{
    Querystring: {
      libraryId?: string;
      type?: string;
      tag?: string;
      performer?: string;
      favorite?: string;
      kind?: string;
      studio?: string;
      parentId?: string;
      q?: string;
      page?: string;
      sort?: string;
    };
  }>("/api/media-items", async (request) => {
    const { libraryId, type, tag, performer, favorite, studio, kind, parentId, q, page, sort } =
      request.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const search = q?.trim();

    // Items whose folder was removed from the scan list stay in the database
    // but drop out of every view, so removing a folder reads as a clean slate.
    const conditions: SQL[] = [eq(mediaItems.inScope, true)];
    if (libraryId) {
      conditions.push(eq(mediaItems.libraryId, Number(libraryId)));
    }
    if (type) {
      conditions.push(eq(mediaItemTypes.name, type));
    } else {
      // Photos are gallery images belonging to the video they sit beside, not
      // library items in their own right — a studio folder holds a scene and
      // its stills. They're reachable through an item's gallery instead, and
      // still addressable here by asking for them explicitly with ?type=photo.
      conditions.push(ne(mediaItemTypes.name, "photo"));
    }
    if (search) {
      // Titles here are machine-derived from filenames and often unhelpful,
      // so searching only them misses the names people actually remember.
      // Studio comes free — it's already left-joined for the studio filter.
      const pattern = `%${escapeLike(search)}%`;
      const performerMatches = db
        .select({ id: mediaItemPerformers.mediaItemId })
        .from(mediaItemPerformers)
        .innerJoin(performers, eq(performers.id, mediaItemPerformers.performerId))
        .where(ilike(performers.name, pattern));
      const tagMatches = db
        .select({ id: mediaItemTags.mediaItemId })
        .from(mediaItemTags)
        .innerJoin(tags, eq(tags.id, mediaItemTags.tagId))
        .where(ilike(tags.name, pattern));

      const match = or(
        ilike(mediaItems.title, pattern),
        ilike(mediaItems.description, pattern),
        ilike(studios.name, pattern),
        inArray(mediaItems.id, performerMatches),
        inArray(mediaItems.id, tagMatches)
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
    // No allow-list here on purpose. A filter for a category that doesn't
    // exist should return nothing — returning everything, which is what the
    // stale constant caused, made one tile show the whole library and look
    // like every video had been duplicated across categories.
    if (kind) {
      conditions.push(eq(mediaItems.kind, kind));
    }
    if (studio) {
      conditions.push(sql`lower(${studios.name}) = lower(${studio})`);
    }
    const favoritesOnly = favorite === "true";
    if (favoritesOnly) {
      conditions.push(eq(mediaItems.isFavorite, true));
    }
    // With no global filter, default to the current folder level (root when
    // parentId is omitted) so nested items don't leak into the top view. Tag,
    // performer and search all deliberately ignore folder nesting — they're
    // global lookups, you shouldn't have to drill into folders to hit them.
    if (!tag && !performer && !search && !favoritesOnly && !studio && !kind) {
      conditions.push(
        parentId ? eq(mediaItems.parentId, Number(parentId)) : isNull(mediaItems.parentId)
      );
    }

    const query = db
      .select({ ...itemColumns, ...playbackColumns })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .leftJoin(studios, eq(studios.id, mediaItems.studioId))
      .leftJoin(playbackStates, eq(playbackStates.mediaItemId, mediaItems.id));

    // Fetching one extra row answers "is there another page?" without a
    // second COUNT(*) over the same filtered set.
    const rows = await (conditions.length > 0 ? query.where(and(...conditions)) : query)
      .orderBy(...orderFor(sort))
      .limit(PAGE_SIZE + 1)
      .offset((pageNum - 1) * PAGE_SIZE);

    const hasMore = rows.length > PAGE_SIZE;
    const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    const related = await fetchRelated(pageRows.map((r) => r.id));

    return {
      items: pageRows.map((r) => withPlayback(r, related)),
      page: pageNum,
      pageSize: PAGE_SIZE,
      hasMore,
    };
  });

  // Resolves the hero setting into actual items, so the homepage doesn't have
  // to know how the setting is shaped.
  app.get("/api/hero-items", async () => {
    const hero = await getHeroSettings();

    const base = db
      .select({ ...itemColumns, ...playbackColumns })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .leftJoin(studios, eq(studios.id, mediaItems.studioId))
      .leftJoin(playbackStates, eq(playbackStates.mediaItemId, mediaItems.id));

    let rows;
    if (hero.source === "manual") {
      if (hero.itemIds.length === 0) return { items: [] };
      const found = await base.where(
        and(
          eq(mediaItemTypes.name, "video"),
          eq(mediaItems.inScope, true),
          inArray(mediaItems.id, hero.itemIds)
        )
      );
      // Preserve the order you arranged them in, which SQL wouldn't.
      const byId = new Map(found.map((r) => [r.id, r]));
      rows = hero.itemIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
    } else if (hero.source === "favorites") {
      rows = await base
        .where(
          and(
            eq(mediaItemTypes.name, "video"),
            eq(mediaItems.inScope, true),
            eq(mediaItems.isFavorite, true)
          )
        )
        .orderBy(desc(mediaItems.createdAt))
        .limit(HERO_LIMIT);
    } else {
      rows = await base
        .where(
          and(
            eq(mediaItemTypes.name, "video"),
            eq(mediaItems.inScope, true),
            isNull(mediaItems.missingSince)
          )
        )
        .orderBy(desc(mediaItems.createdAt))
        .limit(HERO_LIMIT);
    }

    const related = await fetchRelated(rows.map((r) => r.id));
    return {
      items: rows.map((r) => ({
        ...withPlayback(r, related),
      })),
    };
  });

  // Backs the "Continue Watching" row — anything with real progress that
  // isn't essentially finished, most recently watched first.
  app.get("/api/continue-watching", async () => {
    const rows = await db
      .select({ ...itemColumns, ...playbackColumns })
      .from(playbackStates)
      .innerJoin(mediaItems, eq(mediaItems.id, playbackStates.mediaItemId))
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .leftJoin(studios, eq(studios.id, mediaItems.studioId))
      .where(
        and(
          gt(playbackStates.positionSeconds, 15),
          eq(mediaItems.inScope, true),
          // Finished videos drop out of the row rather than sitting at the
          // front of it forever. A video with no known duration is kept —
          // better a stale entry than silently hiding something.
          isNull(playbackStates.completedAt),
          sql`(${mediaItems.durationSeconds} is null or ${playbackStates.positionSeconds} * 100 < ${mediaItems.durationSeconds} * ${WATCHED_PERCENT})`
        )
      )
      .orderBy(desc(playbackStates.updatedAt))
      .limit(RELATED_LIMIT);

    const related = await fetchRelated(rows.map((r) => r.id));
    return {
      items: rows.map((r) => ({
        ...withPlayback(r, related),
      })),
    };
  });

  app.get<{ Params: { id: string } }>("/api/media-items/:id", async (request, reply) => {
    const id = Number(request.params.id);
    const [item] = await db
      .select({
        ...itemColumns,
        ...playbackColumns,
        // The detail view is the only place these are shown, so the join
        // stays here rather than on every listing query.
        fileModifiedAt: mediaFiles.mtime,
        fileSizeBytes: mediaFiles.sizeBytes,
      })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .leftJoin(studios, eq(studios.id, mediaItems.studioId))
      .leftJoin(playbackStates, eq(playbackStates.mediaItemId, mediaItems.id))
      .leftJoin(mediaFiles, eq(mediaFiles.mediaItemId, mediaItems.id))
      .where(and(eq(mediaItems.id, id), eq(mediaItems.inScope, true)));
    if (!item) {
      reply.code(404);
      return { error: "Not found" };
    }
    const related = await fetchRelated([id]);
    return withPlayback(item, related);
  });

  /**
   * The still images that live in the same folder as this item's file.
   *
   * A studio folder holds a scene and its gallery, so "same directory" is the
   * whole relationship — no new table, no manual linking, and moving the
   * folder keeps it intact because it was never stored anywhere.
   *
   * Compared as an exact directory string rather than a LIKE prefix: `_` and
   * `%` are wildcards and both are legal in a folder name, so a prefix match
   * would quietly pull in the wrong folder's photos.
   */
  app.get<{ Params: { id: string } }>("/api/media-items/:id/gallery", async (request) => {
    const id = Number(request.params.id);

    const [file] = await db
      .select({ path: mediaFiles.path })
      .from(mediaFiles)
      .where(eq(mediaFiles.mediaItemId, id));
    if (!file) return { images: [] };

    const directory = file.path.slice(0, file.path.lastIndexOf("/"));
    if (!directory) return { images: [] };

    const rows = await db
      .select({
        id: mediaItems.id,
        title: mediaItems.title,
        thumbnailFile: mediaItems.thumbnailFile,
        path: mediaFiles.path,
      })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .innerJoin(mediaFiles, eq(mediaFiles.mediaItemId, mediaItems.id))
      .where(
        and(
          eq(mediaItemTypes.name, "photo"),
          eq(mediaItems.inScope, true),
          ne(mediaItems.id, id),
          // Everything up to the last slash, compared exactly. A LIKE prefix
          // would treat `_` and `%` in a folder name as wildcards, and both
          // are legal characters — "Little Caprice/100%_Real" would match
          // folders it has nothing to do with.
          sql`substring(${mediaFiles.path} from '^(.*)/[^/]*$') = ${directory}`
        )
      )
      // Filenames are the only stable order here — they're usually numbered.
      .orderBy(asc(mediaFiles.path));

    return {
      images: rows.map((row) => ({
        id: row.id,
        title: row.title,
        thumbnailFile: row.thumbnailFile,
      })),
    };
  });

  // "More like this": no external metadata to compare against, so
  // relatedness means shared tags — the user's own organizing signal —
  // falling back to folder siblings for an untagged item.
  app.get<{ Params: { id: string } }>("/api/media-items/:id/related", async (request, reply) => {
    const id = Number(request.params.id);

    const [item] = await db
      .select()
      .from(mediaItems)
      .where(and(eq(mediaItems.id, id), eq(mediaItems.inScope, true)));
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
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .leftJoin(studios, eq(studios.id, mediaItems.studioId));

    let rows: Awaited<ReturnType<typeof baseQuery.where>> = [];

    if (ownTagIds.length > 0) {
      const relatedIds = db
        .selectDistinct({ id: mediaItemTags.mediaItemId })
        .from(mediaItemTags)
        .where(inArray(mediaItemTags.tagId, ownTagIds));

      rows = await baseQuery
        .where(
          and(
            inArray(mediaItems.id, relatedIds),
            ne(mediaItems.id, id),
            eq(mediaItems.inScope, true)
          )
        )
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
            ne(mediaItemTypes.name, "folder"),
            ne(mediaItemTypes.name, "photo"),
            eq(mediaItems.inScope, true)
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
      isFavorite?: boolean;
      kind?: string;
      studio?: string | null;
      thumbnailPositionX?: number;
      thumbnailPositionY?: number;
      thumbnailScale?: number;
    };
  }>("/api/media-items/:id", async (request, reply) => {
    const id = Number(request.params.id);
    const {
      parentId,
      title,
      description,
      isFavorite,
      kind,
      studio,
      thumbnailPositionX,
      thumbnailPositionY,
      thumbnailScale,
    } = request.body;

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
    if (isFavorite !== undefined) patch.isFavorite = isFavorite;
    if (kind !== undefined) {
      // Checked against the categories table, so a category you created is
      // assignable — the old constant rejected everything but the three
      // seeded slugs, which meant the modal's own dropdown offered options
      // the save then refused.
      if (!(await categorySlugs()).has(kind)) {
        reply.code(400);
        return { error: "Unknown category" };
      }
      patch.kind = kind;
    }
    // Clamped rather than rejected: these come from a drag and a slider, so a
    // value a fraction outside the range is a rounding artefact, not a reason
    // to fail the save. Matches how the category cover framing is handled.
    if (thumbnailPositionX !== undefined) {
      patch.thumbnailPositionX = clampPercent(thumbnailPositionX, 0, 100);
    }
    if (thumbnailPositionY !== undefined) {
      patch.thumbnailPositionY = clampPercent(thumbnailPositionY, 0, 100);
    }
    // Floor of 100: below it the image stops covering its frame and shows
    // bars. Ceiling keeps a poster from being magnified into mush.
    if (thumbnailScale !== undefined) {
      patch.thumbnailScale = clampPercent(thumbnailScale, 100, 300);
    }
    if (studio !== undefined) {
      const name = studio?.trim();
      patch.studioId = name ? await ensureStudioId(name) : null;
      // From here the filename brackets stop deciding this item's studio.
      patch.studioSource = "user";
    }

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
