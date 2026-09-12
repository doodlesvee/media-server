import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { logActivity } from "../activity/log.js";
import { isUnlocked, privacyIsConfigured } from "../auth/privacyUnlock.js";
import {
  forgetAllMissingVideos,
  forgetItems,
  listMissingVideos,
} from "../library/forget.js";

/**
 * Managing videos whose files have gone.
 *
 * Deliberately its own route rather than a DELETE on /api/media-items/:id.
 * Removing a library record is destructive and irreversible, and the only
 * items it is ever safe to offer it for are the ones whose files are already
 * gone. Scoping the endpoint to those means a stray id cannot delete an item
 * that is sitting on disk perfectly fine, whatever the caller intended.
 */
export async function missingRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Refuses the request unless this session has proved the privacy credential.
   *
   * Enforced here, not just in the UI. A page that asks for a password before
   * showing a delete button protects nothing on its own — the endpoint behind
   * it is still a single request away for anything that can reach the API.
   *
   * With no password and no passkey set there is nothing to prove, and
   * demanding it would lock the owner out of their own library permanently.
   * The client shows the same reasoning as a prompt to go and set one.
   */
  async function locked(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> {
    if (!(await privacyIsConfigured())) return false;
    const sessionId = request.user?.sessionId;
    if (sessionId && isUnlocked(sessionId)) return false;
    reply.code(403).send({ error: "Locked", code: "privacy_locked" });
    return true;
  }

  app.get("/api/missing", async (request, reply) => {
    if (await locked(request, reply)) return reply;
    const items = await listMissingVideos();
    return { items };
  });

  app.post<{ Body: { ids?: unknown } }>(
    "/api/missing/forget",
    async (request, reply) => {
      if (await locked(request, reply)) return reply;
      const raw = request.body?.ids;
      if (!Array.isArray(raw)) {
        return reply.code(400).send({ error: "ids must be an array" });
      }
      const ids = raw.filter(
        (id): id is number => typeof id === "number" && Number.isInteger(id),
      );
      if (ids.length === 0) {
        return reply.code(400).send({ error: "No valid ids" });
      }

      const removed = await forgetItems(ids);
      if (removed > 0) {
        await logActivity(
          "library",
          `Removed ${removed} missing ${removed === 1 ? "video" : "videos"} from the library`,
          { removed },
        );
      }
      // `removed` can be lower than what was asked for: an id that is no
      // longer missing, or never was, is skipped rather than deleted.
      return { removed };
    },
  );

  app.post("/api/missing/forget-all", async (request, reply) => {
    if (await locked(request, reply)) return reply;
    const removed = await forgetAllMissingVideos();
    if (removed > 0) {
      await logActivity(
        "library",
        `Removed all ${removed} missing ${removed === 1 ? "video" : "videos"} from the library`,
        { removed },
      );
    }
    return { removed };
  });
}
