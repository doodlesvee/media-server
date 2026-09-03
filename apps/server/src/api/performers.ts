import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import {
  mediaItemPerformers,
  mediaItems,
  mediaItemTypes,
  performers,
} from "../db/schema.js";
import {
  deletePerformerImage,
  performerImagePath,
  savePerformerImage,
  type PerformerImageKind,
} from "../media/performerImages.js";
import { streamFile } from "../media/streamer.js";
import { normalizeName } from "../scanner/performerNames.js";

/**
 * Resolves a name to a performer id, creating the row when it's new.
 * Mirrors the scanner's helper: conflict-tolerant insert then re-select, so
 * two concurrent saves of the same new name can't raise a unique violation.
 */
async function ensurePerformerId(rawName: string): Promise<number> {
  const name = normalizeName(rawName);

  const findId = async (): Promise<number | null> => {
    const [row] = await db
      .select({ id: performers.id })
      .from(performers)
      .where(sql`lower(${performers.name}) = lower(${name})`);
    return row?.id ?? null;
  };

  const existing = await findId();
  if (existing !== null) return existing;

  const [created] = await db
    .insert(performers)
    .values({ name })
    .onConflictDoNothing()
    .returning();
  if (created) return created.id;

  const raced = await findId();
  if (raced === null) throw new Error(`Could not resolve performer "${name}"`);
  return raced;
}

/** Collapses case-only and whitespace-only duplicates within one request. */
function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = normalizeName(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export async function performerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/performers", async () => {
    const videoTypeIds = db
      .select({ id: mediaItemTypes.id })
      .from(mediaItemTypes)
      .where(eq(mediaItemTypes.name, "video"));

    const rows = await db
      .select({
        id: performers.id,
        name: performers.name,
        hasImage: sql<boolean>`(${performers.imageFile} is not null)`,
        hasBanner: sql<boolean>`(${performers.bannerFile} is not null)`,
        // count(<column>) rather than count(*): on a LEFT JOIN with no match,
        // count(*) counts the NULL-padded row and reports 1.
        videoCount: sql<number>`count(${mediaItems.id})::int`,
        representativeItemId: sql<number | null>`max(${mediaItems.id})`,
      })
      .from(performers)
      .leftJoin(mediaItemPerformers, eq(mediaItemPerformers.performerId, performers.id))
      // These predicates belong in the join condition, not a WHERE — in a
      // WHERE they would drop performers with no videos entirely, and a
      // zero-video performer is a valid state we rely on (you create one by
      // hand so the scanner's filename pass can match it next scan).
      .leftJoin(
        mediaItems,
        and(
          eq(mediaItems.id, mediaItemPerformers.mediaItemId),
          isNull(mediaItems.missingSince),
          inArray(mediaItems.itemTypeId, videoTypeIds)
        )
      )
      .groupBy(performers.id, performers.name, performers.imageFile, performers.bannerFile)
      // Plain name ordering is ASCII, which sorts "Zoe" before "alice".
      .orderBy(sql`lower(${performers.name})`);

    return { performers: rows };
  });

  // Backs the profile page: the performer plus enough aggregate to render the
  // header without a second round trip.
  app.get<{ Params: { id: string } }>("/api/performers/:id", async (request, reply) => {
    const id = Number(request.params.id);

    const [performer] = await db.select().from(performers).where(eq(performers.id, id));
    if (!performer) {
      reply.code(404);
      return { error: "Not found" };
    }

    const videoTypeIds = db
      .select({ id: mediaItemTypes.id })
      .from(mediaItemTypes)
      .where(eq(mediaItemTypes.name, "video"));

    const [totals] = await db
      .select({
        videoCount: sql<number>`count(*)::int`,
        totalDurationSeconds: sql<number>`coalesce(sum(${mediaItems.durationSeconds}), 0)::int`,
      })
      .from(mediaItemPerformers)
      .innerJoin(
        mediaItems,
        and(
          eq(mediaItems.id, mediaItemPerformers.mediaItemId),
          isNull(mediaItems.missingSince),
          inArray(mediaItems.itemTypeId, videoTypeIds)
        )
      )
      .where(eq(mediaItemPerformers.performerId, id));

    // Two different frames where possible, so the blurred backdrop isn't the
    // same picture as the portrait sitting on top of it.
    const recentItems = await db
      .select({ id: mediaItems.id })
      .from(mediaItemPerformers)
      .innerJoin(
        mediaItems,
        and(
          eq(mediaItems.id, mediaItemPerformers.mediaItemId),
          isNull(mediaItems.missingSince),
          inArray(mediaItems.itemTypeId, videoTypeIds)
        )
      )
      .where(eq(mediaItemPerformers.performerId, id))
      .orderBy(desc(mediaItems.id))
      .limit(2);

    return {
      id: performer.id,
      name: performer.name,
      hasImage: performer.imageFile !== null,
      hasBanner: performer.bannerFile !== null,
      bannerPositionY: performer.bannerPositionY,
      videoCount: totals?.videoCount ?? 0,
      totalDurationSeconds: totals?.totalDurationSeconds ?? 0,
      representativeItemId: recentItems[0]?.id ?? null,
      bannerItemId: recentItems[1]?.id ?? recentItems[0]?.id ?? null,
    };
  });

  // 404 rather than a placeholder when nothing has been uploaded — the client
  // uses the failure to fall back to a frame from one of their videos.
  app.get<{ Params: { id: string }; Querystring: { kind?: string } }>(
    "/api/performers/:id/image",
    async (request, reply) => {
      const id = Number(request.params.id);
      const kind: PerformerImageKind = request.query.kind === "banner" ? "banner" : "avatar";

      const [performer] = await db.select().from(performers).where(eq(performers.id, id));
      const fileName = kind === "banner" ? performer?.bannerFile : performer?.imageFile;
      if (!performer || !fileName) {
        reply.code(404);
        return { error: "No image" };
      }

      // Safe to cache hard: the filename carries a random suffix, so a
      // replacement is served from a different URL entirely.
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      await streamFile(reply, performerImagePath(fileName), "image/jpeg", undefined, false);
    }
  );

  app.post<{ Params: { id: string }; Querystring: { kind?: string } }>(
    "/api/performers/:id/image",
    async (request, reply) => {
      const id = Number(request.params.id);
      const kind: PerformerImageKind = request.query.kind === "banner" ? "banner" : "avatar";

      const [performer] = await db.select().from(performers).where(eq(performers.id, id));
      if (!performer) {
        reply.code(404);
        return { error: "Not found" };
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
        // Thrown when the multipart limit is exceeded.
        reply.code(413);
        return { error: "Image is too large" };
      }

      let fileName: string;
      try {
        fileName = await savePerformerImage(buffer, id, kind);
      } catch {
        // sharp refuses anything it can't decode, which is what rejects a
        // non-image with the right extension.
        reply.code(400);
        return { error: "That file could not be read as an image" };
      }

      const previous = kind === "banner" ? performer.bannerFile : performer.imageFile;
      await db
        .update(performers)
        .set(
          kind === "banner"
            ? // Reset the framing: a position chosen for the previous picture
              // is meaningless against a new one.
              { bannerFile: fileName, bannerPositionY: 50 }
            : { imageFile: fileName }
        )
        .where(eq(performers.id, id));
      // Only after the row points at the new file, so a failure here leaves a
      // stray file rather than a broken reference.
      await deletePerformerImage(previous);

      return { ok: true, kind };
    }
  );

  app.delete<{ Params: { id: string }; Querystring: { kind?: string } }>(
    "/api/performers/:id/image",
    async (request, reply) => {
      const id = Number(request.params.id);
      const kind: PerformerImageKind = request.query.kind === "banner" ? "banner" : "avatar";

      const [performer] = await db.select().from(performers).where(eq(performers.id, id));
      if (!performer) {
        reply.code(404);
        return { error: "Not found" };
      }

      const previous = kind === "banner" ? performer.bannerFile : performer.imageFile;
      await db
        .update(performers)
        .set(kind === "banner" ? { bannerFile: null } : { imageFile: null })
        .where(eq(performers.id, id));
      await deletePerformerImage(previous);

      return { ok: true, kind };
    }
  );

  // Replaces an item's whole performer set, matching how the editor works:
  // you edit the list, then save. Unknown names are created on the fly.
  app.put<{ Params: { id: string }; Body: { performerNames: string[] } }>(
    "/api/media-items/:id/performers",
    async (request, reply) => {
      const itemId = Number(request.params.id);
      const names = dedupeNames(request.body.performerNames ?? []);

      const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, itemId));
      if (!item) {
        reply.code(404);
        return { error: "Not found" };
      }

      const performerIds = await Promise.all(names.map(ensurePerformerId));

      // Transactional because a crash between the delete and the insert would
      // lose the set *and* leave performersSource = 'user', so the scanner
      // would never restore it.
      await db.transaction(async (tx) => {
        await tx
          .delete(mediaItemPerformers)
          .where(eq(mediaItemPerformers.mediaItemId, itemId));
        if (performerIds.length > 0) {
          await tx
            .insert(mediaItemPerformers)
            .values(performerIds.map((performerId) => ({ mediaItemId: itemId, performerId })))
            .onConflictDoNothing();
        }
        // From here the folder layout no longer decides this item's
        // performers — including when the list is now deliberately empty.
        await tx
          .update(mediaItems)
          .set({ performersSource: "user", updatedAt: new Date() })
          .where(eq(mediaItems.id, itemId));
      });

      const assigned =
        performerIds.length > 0
          ? await db
              .select({ id: performers.id, name: performers.name })
              .from(performers)
              .where(inArray(performers.id, performerIds))
          : [];
      return { performers: assigned };
    }
  );

  app.patch<{ Params: { id: string }; Body: { name?: string; bannerPositionY?: number } }>(
    "/api/performers/:id",
    async (request, reply) => {
      const id = Number(request.params.id);
      const { bannerPositionY } = request.body;

      // Position-only update: the drag control saves through here, and must
      // not require re-sending the name.
      if (request.body.name === undefined && bannerPositionY !== undefined) {
        const updated = await db
          .update(performers)
          // Clamped rather than rejected — a value outside 0-100 is a client
          // rounding artefact, not something worth failing a save over.
          .set({ bannerPositionY: Math.max(0, Math.min(100, Math.round(bannerPositionY))) })
          .where(eq(performers.id, id))
          .returning();
        if (updated.length === 0) {
          reply.code(404);
          return { error: "Not found" };
        }
        return { performer: updated[0] };
      }

      const name = normalizeName(request.body.name ?? "");
      if (!name) {
        reply.code(400);
        return { error: "name cannot be empty" };
      }

      // Checked up front so a collision reads as a 409 rather than surfacing
      // the raw unique-index violation as a 500.
      const [clash] = await db
        .select({ id: performers.id })
        .from(performers)
        .where(sql`lower(${performers.name}) = lower(${name}) and ${performers.id} <> ${id}`);
      if (clash) {
        reply.code(409);
        return { error: `A performer named "${name}" already exists` };
      }

      const updated = await db
        .update(performers)
        .set({ name })
        .where(eq(performers.id, id))
        .returning();
      if (updated.length === 0) {
        reply.code(404);
        return { error: "Not found" };
      }
      return { performer: updated[0] };
    }
  );

  app.delete<{ Params: { id: string } }>("/api/performers/:id", async (request, reply) => {
    const id = Number(request.params.id);

    const [existing] = await db.select().from(performers).where(eq(performers.id, id));
    if (!existing) {
      reply.code(404);
      return { error: "Not found" };
    }

    // No FK in this schema cascades, so the join rows have to go first.
    const unlinked = await db
      .delete(mediaItemPerformers)
      .where(eq(mediaItemPerformers.performerId, id))
      .returning();
    await db.delete(performers).where(eq(performers.id, id));
    await deletePerformerImage(existing.imageFile);
    await deletePerformerImage(existing.bannerFile);

    // Worth surfacing in the UI: a performer derived from a folder comes back
    // on the next scan for any item still marked 'scanner'. That's correct —
    // the folder still says so — but it looks like the delete failed.
    return { ok: true, unlinkedCount: unlinked.length };
  });
}
