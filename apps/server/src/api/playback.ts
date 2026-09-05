import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { playbackStates } from "../db/schema.js";

export async function playbackRoutes(app: FastifyInstance): Promise<void> {
  app.put<{ Params: { id: string }; Body: { positionSeconds: number } }>(
    "/api/media-items/:id/playback",
    async (request, reply) => {
      const mediaItemId = Number(request.params.id);
      const { positionSeconds } = request.body;

      if (typeof positionSeconds !== "number" || positionSeconds < 0) {
        reply.code(400);
        return { error: "positionSeconds must be a non-negative number" };
      }

      await db
        .insert(playbackStates)
        .values({ mediaItemId, positionSeconds })
        .onConflictDoUpdate({
          target: playbackStates.mediaItemId,
          set: { positionSeconds, updatedAt: new Date() },
        });

      return { ok: true };
    }
  );

  /**
   * Marks a video finished, or puts it back in the unwatched pile.
   *
   * Separate from the position endpoint on purpose: that one fires every few
   * seconds during playback, and folding a play-count increment into it would
   * count one viewing dozens of times.
   */
  app.put<{ Params: { id: string }; Body: { watched: boolean } }>(
    "/api/media-items/:id/watched",
    async (request, reply) => {
      const mediaItemId = Number(request.params.id);
      const { watched } = request.body;

      if (typeof watched !== "boolean") {
        reply.code(400);
        return { error: "watched must be a boolean" };
      }

      if (!watched) {
        // Un-marking leaves the play count alone — it's a record of what
        // actually happened, not a toggle.
        await db
          .update(playbackStates)
          .set({ completedAt: null, positionSeconds: 0, updatedAt: new Date() })
          .where(eq(playbackStates.mediaItemId, mediaItemId));
        return { ok: true, watched: false };
      }

      const now = new Date();
      // Position resets to 0 so reopening starts from the top rather than
      // offering to resume from the final seconds.
      const [row] = await db
        .insert(playbackStates)
        .values({ mediaItemId, positionSeconds: 0, completedAt: now, playCount: 1 })
        .onConflictDoUpdate({
          target: playbackStates.mediaItemId,
          set: {
            positionSeconds: 0,
            completedAt: now,
            // Watching something twice counts twice; re-marking something
            // already flagged watched doesn't.
            playCount: sql`case when ${playbackStates.completedAt} is null
              then ${playbackStates.playCount} + 1
              else ${playbackStates.playCount} end`,
            updatedAt: now,
          },
        })
        .returning({ playCount: playbackStates.playCount });

      return { ok: true, watched: true, playCount: row?.playCount ?? 1 };
    }
  );
}
