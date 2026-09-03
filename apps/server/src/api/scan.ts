import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { scanJobs } from "../db/schema.js";
import { isScanRunning, startScan } from "../scanner/pipeline.js";

export async function scanRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/scan", async (_request, reply) => {
    if (isScanRunning()) {
      reply.code(409);
      return { error: "A scan is already running" };
    }

    const id = await startScan();
    reply.code(202);
    return { id };
  });

  app.get<{ Params: { id: string } }>("/api/scan/:id", async (request, reply) => {
    const id = Number(request.params.id);
    const [job] = await db.select().from(scanJobs).where(eq(scanJobs.id, id));
    if (!job) {
      reply.code(404);
      return { error: "Not found" };
    }
    return job;
  });
}
