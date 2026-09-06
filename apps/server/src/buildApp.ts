import { existsSync } from "node:fs";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { albumRoutes } from "./api/albums.js";
import { backupRoutes } from "./api/backups.js";
import { categoryRoutes } from "./api/categories.js";
import { collectionRoutes } from "./api/collections.js";
import { folderRoutes } from "./api/folders.js";
import { libraryRoutes } from "./api/library.js";
import { mediaItemRoutes } from "./api/mediaItems.js";
import { mediaRoutes } from "./api/media.js";
import { playbackRoutes } from "./api/playback.js";
import { scanRoutes } from "./api/scan.js";
import { settingsRoutes } from "./api/settings.js";
import { statsRoutes } from "./api/stats.js";
import { performerRoutes } from "./api/performers.js";
import { tagRoutes } from "./api/tags.js";
import { authRoutes } from "./api/auth.js";
import { registerAuthGuard } from "./auth/guard.js";
import { checkDbConnection } from "./db/client.js";
import { MAX_UPLOAD_BYTES } from "./media/performerImages.js";

/**
 * Builds the server without starting it or touching the database schema.
 *
 * Separate from the entry point so tests can drive the real routes in-process
 * with `app.inject()` — no port, no network, and no risk of testing a mock
 * that behaves like the mock rather than like the app. Migrations, seeding and
 * the scan schedule are the entry point's job, because a test wants to control
 * when those happen.
 */
export async function buildApp({ logger = false }: { logger?: boolean } = {}): Promise<
  FastifyInstance
> {
  const app = Fastify({ logger });

  await app.register(cookie);

  // Registered before any route so the guard sees every /api request. Routes
  // added later are protected automatically — deny-by-default.
  registerAuthGuard(app);

  // Performer artwork uploads. The size cap is enforced here rather than in
  // the route so an oversized body is rejected while streaming, before it can
  // be buffered into memory.
  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  await app.register(swagger, {
    openapi: { info: { title: "Media Server API", version: "0.0.1" } },
  });
  await app.register(swaggerUi, { routePrefix: "/api/docs" });

  app.get(
    "/api/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: { status: { type: "string" }, db: { type: "boolean" } },
          },
        },
      },
    },
    async () => {
      const dbOk = await checkDbConnection();
      return { status: "ok", db: dbOk };
    }
  );

  await app.register(authRoutes);
  await app.register(scanRoutes);
  await app.register(mediaItemRoutes);
  await app.register(mediaRoutes);
  await app.register(tagRoutes);
  await app.register(performerRoutes);
  await app.register(collectionRoutes);
  await app.register(folderRoutes);
  await app.register(playbackRoutes);
  await app.register(statsRoutes);
  await app.register(settingsRoutes);
  await app.register(libraryRoutes);
  await app.register(backupRoutes);
  await app.register(categoryRoutes);
  await app.register(albumRoutes);

  // In the production Docker image the built frontend is copied to ../web-dist
  // (see Dockerfile). In local dev that directory doesn't exist — the Vite dev
  // server handles the frontend instead, proxying /api to this server.
  const webDistPath = path.resolve(import.meta.dirname, "../web-dist");
  if (existsSync(webDistPath)) {
    await app.register(fastifyStatic, { root: webDistPath });

    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith("/api")) {
        reply.code(404).send({ error: "Not Found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return app;
}
