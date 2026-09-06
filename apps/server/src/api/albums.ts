import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { albums, mediaFiles, mediaItemTypes, mediaItems, performers, studios } from "../db/schema.js";

const PAGE_SIZE = 100;

/**
 * Albums: a directory of photos, with the video they belong to.
 *
 * The rows are built by the scanner (assignAlbums in scanner/pipeline.ts) —
 * nothing here creates or edits one, because the filesystem decides what an
 * album is.
 */
export async function albumRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/albums", async () => {
    // Grouped, not a correlated subquery per row. Drizzle renders an
    // unaliased column unqualified, which is ambiguous inside a subquery, and
    // an alias is not a table outside the query declaring it — both mistakes
    // have already broken queries in this project.
    const rows = await db
      .select({
        id: albums.id,
        title: albums.title,
        performer: performers.name,
        studio: studios.name,
        photoCount: sql<number>`count(*) filter (where ${mediaItemTypes.name} = 'photo')::int`,
        // Lowest id is the first photo by scan order, which follows filename
        // order — so a numbered gallery shows its opening shot.
        coverItemId: sql<number | null>`min(${mediaItems.id}) filter (
          where ${mediaItemTypes.name} = 'photo'
        )`,
        videoItemId: sql<number | null>`min(${mediaItems.id}) filter (
          where ${mediaItemTypes.name} = 'video'
        )`,
      })
      .from(albums)
      .leftJoin(
        mediaItems,
        and(eq(mediaItems.albumId, albums.id), eq(mediaItems.inScope, true))
      )
      .leftJoin(mediaItemTypes, eq(mediaItemTypes.id, mediaItems.itemTypeId))
      .leftJoin(performers, eq(performers.id, albums.performerId))
      .leftJoin(studios, eq(studios.id, albums.studioId))
      .groupBy(albums.id, albums.title, performers.name, studios.name)
      .orderBy(sql`lower(${albums.title})`);

    // An album whose photos all went out of scope has nothing to show; the
    // scanner purges it, but a folder removed since the last scan would
    // otherwise appear here as an empty card.
    return { albums: rows.filter((row) => row.photoCount > 0) };
  });

  app.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/api/albums/:id",
    async (request, reply) => {
      const id = Number(request.params.id);
      const pageNum = Math.max(1, Number(request.query.page) || 1);

      const [album] = await db
        .select({
          id: albums.id,
          title: albums.title,
          performer: performers.name,
          studio: studios.name,
        })
        .from(albums)
        .leftJoin(performers, eq(performers.id, albums.performerId))
        .leftJoin(studios, eq(studios.id, albums.studioId))
        .where(eq(albums.id, id));

      if (!album) {
        reply.code(404);
        return { error: "Not found" };
      }

      // One row past the page size answers "is there more?" without a second
      // COUNT(*) — the same convention /api/media-items uses.
      const rows = await db
        .select({
          id: mediaItems.id,
          title: mediaItems.title,
          itemType: mediaItemTypes.name,
          thumbnailFile: mediaItems.thumbnailFile,
        })
        .from(mediaItems)
        .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
        .innerJoin(mediaFiles, eq(mediaFiles.mediaItemId, mediaItems.id))
        .where(
          and(
            eq(mediaItems.albumId, id),
            eq(mediaItems.inScope, true),
            eq(mediaItemTypes.name, "photo")
          )
        )
        // Filenames are usually numbered, so path order is the intended order.
        .orderBy(asc(mediaFiles.path))
        .limit(PAGE_SIZE + 1)
        .offset((pageNum - 1) * PAGE_SIZE);

      const hasMore = rows.length > PAGE_SIZE;

      const [video] = await db
        .select({ id: mediaItems.id, title: mediaItems.title })
        .from(mediaItems)
        .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
        .where(
          and(
            eq(mediaItems.albumId, id),
            eq(mediaItems.inScope, true),
            eq(mediaItemTypes.name, "video")
          )
        )
        .limit(1);

      return {
        ...album,
        video: video ?? null,
        photos: hasMore ? rows.slice(0, PAGE_SIZE) : rows,
        page: pageNum,
        pageSize: PAGE_SIZE,
        hasMore,
      };
    }
  );
}
