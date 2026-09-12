import { rm } from "node:fs/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { isUnlocked, privacyIsConfigured } from "../auth/privacyUnlock.js";
import { createBackup, listBackups, resolveBackupPath } from "../backup/create.js";
import { RestoreError, restoreBackup } from "../backup/restore.js";
import { readRestoreMarker } from "../backup/restoreState.js";
import { streamFile } from "../media/streamer.js";

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Refuses unless this session has proved the privacy credential.
   *
   * Same helper as the missing-videos manager, for the same reason: a dialog
   * in the UI protects nothing while the endpoint behind it is one request
   * away. Restoring is the most destructive thing the app can do.
   *
   * With nothing configured there is nothing to prove, and this deliberately
   * lets the request through — which is what makes a fresh clone recoverable,
   * since a brand-new install has no privacy credential to offer.
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

  app.get("/api/backups/restore-state", async () => ({
    interrupted: await readRestoreMarker(),
  }));

  app.post<{ Params: { name: string } }>(
    "/api/backups/:name/restore",
    async (request, reply) => {
      if (await locked(request, reply)) return reply;
      try {
        return await restoreBackup(request.params.name);
      } catch (err) {
        const status = err instanceof RestoreError ? err.status : 500;
        const message = err instanceof Error ? err.message : String(err);
        // The message is the whole UI here — it is the only account the user
        // gets of whether their library still exists.
        reply.code(status);
        return { error: message };
      }
    },
  );

  app.get("/api/backups", async () => ({ backups: await listBackups() }));

  app.post("/api/backups", async (_request, reply) => {
    try {
      const backup = await createBackup();
      return { backup };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 409 for the concurrency guard, 500 for anything genuinely broken —
      // the UI shows the message either way, so it needs to be readable.
      reply.code(message.includes("already running") ? 409 : 500);
      return { error: message };
    }
  });

  app.get<{ Params: { name: string } }>(
    "/api/backups/:name",
    { exposeHeadRoute: false },
    async (request, reply) => {
      const filePath = resolveBackupPath(request.params.name);
      if (!filePath) {
        reply.code(400);
        return { error: "Invalid backup name" };
      }
      reply.header("Content-Disposition", `attachment; filename="${request.params.name}"`);
      await streamFile(reply, filePath, "application/gzip", request.headers.range, false);
    }
  );

  app.delete<{ Params: { name: string } }>("/api/backups/:name", async (request, reply) => {
    const filePath = resolveBackupPath(request.params.name);
    if (!filePath) {
      reply.code(400);
      return { error: "Invalid backup name" };
    }
    await rm(filePath, { force: true });
    return { ok: true };
  });
}
