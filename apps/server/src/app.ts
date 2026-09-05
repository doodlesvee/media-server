import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
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
import { purgeExpiredSessions } from "./auth/sessions.js";
import { startScanSchedule } from "./scanner/schedule.js";
import { checkDbConnection, runMigrations } from "./db/client.js";
import { MAX_UPLOAD_BYTES } from "./media/performerImages.js";
import { seed, seedCategories } from "./db/seed.js";

const app = Fastify({ logger: true });

await runMigrations();
await seed();
await seedCategories();
await purgeExpiredSessions();
await startScanSchedule();

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
  openapi: {
    info: {
      title: "Media Server API",
      version: "0.0.1",
    },
  },
});

await app.register(swaggerUi, {
  routePrefix: "/api/docs",
});

app.get(
  "/api/health",
  {
    schema: {
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string" },
            db: { type: "boolean" },
          },
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

// In the production Docker image the built frontend is copied to ../web-dist
// (see Dockerfile). In local dev that directory doesn't exist — the Vite dev
// server handles the frontend instead, proxying /api to this server.
const webDistPath = path.resolve(import.meta.dirname, "../web-dist");
if (existsSync(webDistPath)) {
  await app.register(fastifyStatic, {
    root: webDistPath,
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith("/api")) {
      reply.code(404).send({ error: "Not Found" });
      return;
    }
    reply.sendFile("index.html");
  });
}

const port = Number(process.env.PORT ?? 3000);

app
  .listen({ port, host: "0.0.0.0" })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
