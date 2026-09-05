import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { libraries, libraryRoots, mediaFiles, mediaItems } from "../db/schema.js";
import { clearScopeForRoot, purgeEmptyEntities, recomputeScope } from "../library/scope.js";

// A container can only see what's mounted into it, so these are the mount
// points the picker is allowed to walk. Anything outside them isn't a
// permissions decision — the path genuinely doesn't exist in here.
const BROWSE_ROOTS = (process.env.BROWSE_ROOTS ?? process.env.MEDIA_ROOT ?? "/media")
  .split(",")
  .map((p) => path.resolve(p.trim()))
  .filter(Boolean);

const MEDIA_ROOT = path.resolve(process.env.MEDIA_ROOT ?? "/media");

function isInsideBrowseRoots(candidate: string): boolean {
  const resolved = path.resolve(candidate);
  return BROWSE_ROOTS.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep)
  );
}

/** Roots that actually exist right now — an unplugged drive shouldn't show. */
async function availableRoots(): Promise<{ name: string; path: string }[]> {
  const labels: Record<string, string> = {
    [MEDIA_ROOT]: "Media library",
    "/host/home": "Home folder",
    "/host/volumes": "External drives",
  };
  const found = await Promise.all(
    BROWSE_ROOTS.map(async (root) => {
      try {
        const info = await stat(root);
        if (!info.isDirectory()) return null;
        return { name: labels[root] ?? path.basename(root), path: root };
      } catch {
        return null;
      }
    })
  );
  return found.filter((r): r is { name: string; path: string } => r !== null);
}

/** Directories only, skipping the dot/@ entries that are filesystem noise. */
async function listSubdirectories(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !/^[.@#]/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/library/roots", async () => {
    const rows = await db
      .select({
        id: libraryRoots.id,
        libraryId: libraryRoots.libraryId,
        path: libraryRoots.path,
      })
      .from(libraryRoots)
      .orderBy(libraryRoots.id);

    // File counts are per-root, not per-library: two roots can share one
    // library, and "how many files came from this folder" is the useful
    // number when deciding whether to remove it.
    const withCounts = await Promise.all(
      rows.map(async (root) => {
        const [counted] = await db
          .select({ files: sql<number>`count(*)::int` })
          .from(mediaFiles)
          .where(sql`${mediaFiles.path} like ${root.path + "/%"}`);
        return {
          ...root,
          files: counted?.files ?? 0,
          // A root outside the mount can never be scanned — it's left over
          // from a previous MEDIA_ROOT and is only useful to delete.
          reachable: isInsideBrowseRoots(root.path),
        };
      })
    );

    return { mediaRoot: MEDIA_ROOT, browseRoots: await availableRoots(), roots: withCounts };
  });

  // Powers the folder browser. Returns children of `path`, defaulting to the
  // mount itself.
  app.get<{ Querystring: { path?: string } }>(
    "/api/library/browse",
    async (request, reply) => {
      if (!request.query.path) {
        const roots = await availableRoots();
        return {
          path: null,
          parent: null,
          directories: roots.map((r) => ({ name: r.name, path: r.path })),
        };
      }
      const target = path.resolve(request.query.path);

      // Guards against ../ escaping the mount — the path arrives from the
      // client, so it can't be trusted even though the UI only sends
      // values it was given.
      if (!isInsideBrowseRoots(target)) {
        reply.code(400);
        return { error: "That folder isn't inside a directory the server can see" };
      }

      try {
        const names = await listSubdirectories(target);
        return {
          path: target,
          // Null at a mount point, so "Up" returns to the root list rather
          // than walking into the container's own filesystem.
          parent: BROWSE_ROOTS.includes(target) ? null : path.dirname(target),
          directories: names.map((name) => ({ name, path: path.join(target, name) })),
        };
      } catch {
        reply.code(404);
        return { error: "Folder not found" };
      }
    }
  );

  app.post<{ Body: { path?: string } }>("/api/library/roots", async (request, reply) => {
    const candidate = request.body.path ? path.resolve(request.body.path) : "";
    if (!candidate || !isInsideBrowseRoots(candidate)) {
      reply.code(400);
      return { error: "Choose a folder the server can see" };
    }

    try {
      const info = await stat(candidate);
      if (!info.isDirectory()) {
        reply.code(400);
        return { error: "That path is not a folder" };
      }
    } catch {
      reply.code(400);
      return { error: "That folder doesn't exist" };
    }

    const existing = await db
      .select({ id: libraryRoots.id, path: libraryRoots.path })
      .from(libraryRoots);

    if (existing.some((r) => r.path === candidate)) {
      reply.code(409);
      return { error: "That folder is already being scanned" };
    }
    // Nesting would scan the same files twice under two roots, and the
    // second pass would fight the first over performer assignment.
    const overlap = existing.find(
      (r) =>
        candidate.startsWith(r.path + path.sep) || r.path.startsWith(candidate + path.sep)
    );
    if (overlap) {
      reply.code(409);
      return { error: `That overlaps a folder already scanned (${overlap.path})` };
    }

    const [library] = await db.select().from(libraries).orderBy(libraries.id).limit(1);
    if (!library) {
      reply.code(500);
      return { error: "No library exists" };
    }

    const [created] = await db
      .insert(libraryRoots)
      .values({ libraryId: library.id, path: candidate })
      .returning();

    // Re-attach anything already scanned from this path, so re-adding a folder
    // restores its items instantly rather than waiting for the next scan.
    await recomputeScope();

    return { root: created };
  });

  app.delete<{ Params: { id: string } }>("/api/library/roots/:id", async (request, reply) => {
    const id = Number(request.params.id);
    const [root] = await db.select().from(libraryRoots).where(eq(libraryRoots.id, id));
    if (!root) {
      reply.code(404);
      return { error: "Not found" };
    }

    // Clear any "missing" flag on that folder's items: you chose to stop
    // watching it, which isn't the same as the files having vanished.
    const affected = db
      .select({ id: mediaFiles.mediaItemId })
      .from(mediaFiles)
      .where(eq(mediaFiles.rootId, id));
    await db
      .update(mediaItems)
      .set({ missingSince: null })
      .where(inArray(mediaItems.id, affected));

    // Hide the items rather than deleting them, so adding the folder back
    // returns everything — titles, performers, favourites and all.
    //
    // Must run *before* the root row goes: media_files.root_id references it,
    // and the FK has no ON DELETE action, so deleting first fails outright.
    await clearScopeForRoot(id);

    await db.delete(libraryRoots).where(eq(libraryRoots.id, id));

    // Performers and studios with no visible items left are debris from the
    // folder that just went. Items are only hidden, so nothing authored is
    // lost — but the lists stop showing names from a library you no longer have.
    await purgeEmptyEntities();

    return { ok: true };
  });
}

export { mediaItems };
