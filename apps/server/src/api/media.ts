import path from "node:path";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { libraryRoots, mediaFiles, mediaItems, mediaItemTypes } from "../db/schema.js";
import { streamFile } from "../media/streamer.js";
import { previewPathFor } from "../media/preview.js";
import { getOrCreatePhotoThumbnail, getPosterPath } from "../media/thumbnails.js";

type ResolvedFile = {
  itemType: string;
  filePath: string;
  mimeType: string | null;
  contentHash: string | null;
};

function isPathUnderRoot(filePath: string, root: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(filePath);
  return resolvedFile === resolvedRoot || resolvedFile.startsWith(resolvedRoot + path.sep);
}

// Defense in depth: filePath comes from our own DB, not raw user input, but we
// still confirm it's still within one of the item's library roots before ever
// serving bytes from it.
async function resolveItemFile(itemId: number): Promise<ResolvedFile | null> {
  const [row] = await db
    .select({
      itemType: mediaItemTypes.name,
      libraryId: mediaItems.libraryId,
      filePath: mediaFiles.path,
      mimeType: mediaFiles.mimeType,
      contentHash: mediaFiles.contentHash,
    })
    .from(mediaItems)
    .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
    .innerJoin(mediaFiles, eq(mediaFiles.mediaItemId, mediaItems.id))
    .where(eq(mediaItems.id, itemId));

  if (!row) return null;

  const roots = await db
    .select({ path: libraryRoots.path })
    .from(libraryRoots)
    .where(eq(libraryRoots.libraryId, row.libraryId));

  const underRoot = roots.some((r) => isPathUnderRoot(row.filePath, r.path));
  if (!underRoot) return null;

  return {
    itemType: row.itemType,
    filePath: row.filePath,
    mimeType: row.mimeType,
    contentHash: row.contentHash,
  };
}

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { itemId: string } }>(
    "/api/stream/:itemId",
    // Registered manually below instead, so a HEAD request doesn't actually
    // open/stream the file just to have Fastify's default auto-HEAD discard it.
    { exposeHeadRoute: false },
    async (request, reply) => {
      const file = await resolveItemFile(Number(request.params.itemId));
      if (!file) {
        reply.code(404);
        return { error: "Not found" };
      }
      await streamFile(
        reply,
        file.filePath,
        file.mimeType ?? "application/octet-stream",
        request.headers.range,
        false
      );
    }
  );

  app.head<{ Params: { itemId: string } }>("/api/stream/:itemId", async (request, reply) => {
    const file = await resolveItemFile(Number(request.params.itemId));
    if (!file) {
      reply.code(404).send();
      return;
    }
    await streamFile(
      reply,
      file.filePath,
      file.mimeType ?? "application/octet-stream",
      request.headers.range,
      true
    );
  });

  // Short, low-res clip cut at scan time. Unlike seeking into the full file,
  // this starts instantly and its first frame is the poster image, so the
  // still-to-motion hand-off is invisible.
  app.get<{ Params: { id: string } }>(
    "/api/media-items/:id/preview",
    async (request, reply) => {
      const id = Number(request.params.id);
      const file = await resolveItemFile(id);
      if (!file || file.itemType !== "video") {
        reply.code(404);
        return { error: "Not found" };
      }

      await streamFile(
        reply,
        previewPathFor(id, file.contentHash),
        "video/mp4",
        request.headers.range,
        false
      );
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/media-items/:id/thumbnail",
    async (request, reply) => {
      const id = Number(request.params.id);
      const file = await resolveItemFile(id);
      if (!file) {
        reply.code(404);
        return { error: "Not found" };
      }

      const thumbPath =
        file.itemType === "video"
          ? await getPosterPath(id, file.contentHash)
          : await getOrCreatePhotoThumbnail(file.filePath, id, file.contentHash);

      if (!thumbPath) {
        reply.code(404);
        return { error: "No thumbnail available" };
      }

      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      await streamFile(reply, thumbPath, "image/jpeg", undefined, false);
    }
  );
}
