import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { mediaItemRoutes } from "./api/mediaItems.js";
import { mediaRoutes } from "./api/media.js";
import { scanRoutes } from "./api/scan.js";
import { checkDbConnection, runMigrations } from "./db/client.js";
import { seed } from "./db/seed.js";

const app = Fastify({ logger: true });

await runMigrations();
await seed();

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

await app.register(scanRoutes);
await app.register(mediaItemRoutes);
await app.register(mediaRoutes);

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
