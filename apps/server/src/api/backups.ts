import { rm } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { createBackup, listBackups, resolveBackupPath } from "../backup/create.js";
import { streamFile } from "../media/streamer.js";

export async function backupRoutes(app: FastifyInstance): Promise<void> {
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
