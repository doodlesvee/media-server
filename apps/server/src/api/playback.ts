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
}
