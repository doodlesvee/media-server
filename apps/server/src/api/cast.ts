import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { signCastToken } from "../auth/castTokens.js";
import { db } from "../db/client.js";
import { mediaItems, mediaItemTypes } from "../db/schema.js";
import { isLocalHost, lanAddresses, lanPort } from "../net/lan.js";

/**
 * A stream URL a TV can fetch by itself.
 *
 * Two things stop the ordinary one working there: it has no session cookie
 * (the token fixes that), and when you are on this machine it says
 * "localhost", which on the TV means the TV. So the host is swapped for this
 * machine's address on the network — the one the phone already used, if the
 * request came from a phone, or the LAN address otherwise.
 *
 * `lanReachable: false` means no network address is known (a container with
 * LAN_HOST unset). The link is still returned: casting from desktop Chrome
 * streams from the browser and never fetches it, so it works regardless.
 */
export async function castRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/api/media-items/:id/cast", async (request, reply) => {
    const id = Number(request.params.id);
    const [item] = await db
      .select({ type: mediaItemTypes.name })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItemTypes.id, mediaItems.itemTypeId))
      .where(eq(mediaItems.id, id));
    if (!item || item.type !== "video") {
      reply.code(404);
      return { error: "Not found" };
    }

    const path = `/api/stream/${id}?cast=${signCastToken(id)}`;
    const host = request.headers.host;
    const networkHost = !isLocalHost(host)
      ? host
      : lanAddresses()[0]
        ? `${lanAddresses()[0]}:${lanPort()}`
        : null;

    return networkHost
      ? { url: `http://${networkHost}${path}`, lanReachable: true }
      : { url: path, lanReachable: false };
  });
}
