import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { bookmarks, mediaItems } from "../db/schema.js";

const MAX_LABEL_LENGTH = 200;

/** Trims, and turns an empty label into no label rather than "". */
function cleanLabel(label: string | null | undefined): string | null {
  const trimmed = label?.trim().slice(0, MAX_LABEL_LENGTH);
  return trimmed ? trimmed : null;
}

const columns = {
  id: bookmarks.id,
  mediaItemId: bookmarks.mediaItemId,
  positionSeconds: bookmarks.positionSeconds,
  label: bookmarks.label,
  createdAt: bookmarks.createdAt,
};

/**
 * Moments marked inside a video.
 *
 * Listed in playback order rather than the order they were made: they are
 * drawn as ticks along the seek bar and read as a table of contents, and both
 * of those run left to right through the video.
 */
export async function bookmarkRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/api/media-items/:id/bookmarks", async (request) => {
    const id = Number(request.params.id);
    const rows = await db
      .select(columns)
      .from(bookmarks)
      .where(eq(bookmarks.mediaItemId, id))
      .orderBy(asc(bookmarks.positionSeconds), asc(bookmarks.id));
    return { bookmarks: rows };
  });

  app.post<{
    Params: { id: string };
    Body: { positionSeconds: number; label?: string | null };
  }>("/api/media-items/:id/bookmarks", async (request, reply) => {
    const id = Number(request.params.id);
    const { positionSeconds, label } = request.body ?? {};

    if (typeof positionSeconds !== "number" || !Number.isFinite(positionSeconds) || positionSeconds < 0) {
      reply.code(400);
      return { error: "positionSeconds must be a number of seconds, 0 or more" };
    }

    const [item] = await db
      .select({ durationSeconds: mediaItems.durationSeconds })
      .from(mediaItems)
      .where(eq(mediaItems.id, id));
    if (!item) {
      reply.code(404);
      return { error: "Not found" };
    }

    // Clamped to the video's length where it is known. The player reports
    // currentTime a fraction past the end on the final frame, and a tick
    // drawn past 100% of the bar would hang off its end.
    const whole = Math.floor(positionSeconds);
    const position =
      item.durationSeconds != null ? Math.min(whole, item.durationSeconds) : whole;

    const [created] = await db
      .insert(bookmarks)
      .values({ mediaItemId: id, positionSeconds: position, label: cleanLabel(label) })
      .returning(columns);

    reply.code(201);
    return created;
  });

  app.patch<{ Params: { id: string }; Body: { label?: string | null } }>(
    "/api/bookmarks/:id",
    async (request, reply) => {
      const id = Number(request.params.id);
      const [updated] = await db
        .update(bookmarks)
        .set({ label: cleanLabel(request.body?.label) })
        .where(eq(bookmarks.id, id))
        .returning(columns);
      if (!updated) {
        reply.code(404);
        return { error: "Not found" };
      }
      return updated;
    }
  );

  app.delete<{ Params: { id: string } }>("/api/bookmarks/:id", async (request, reply) => {
    const id = Number(request.params.id);
    const deleted = await db
      .delete(bookmarks)
      .where(eq(bookmarks.id, id))
      .returning({ id: bookmarks.id });
    if (deleted.length === 0) {
      reply.code(404);
      return { error: "Not found" };
    }
    return { ok: true };
  });
}
