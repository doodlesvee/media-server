import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { FastifyReply } from "fastify";

// Fastify's `reply.send(fsReadStream)` has a known incompatibility on this
// Node version: the response resolves as "completed" immediately while zero
// bytes are actually flushed (confirmed via a minimal repro — a plain
// in-memory Readable works fine through reply.send, but an fs.ReadStream
// silently produces an empty body). Writing directly to the raw response via
// reply.hijack() bypasses Fastify's stream handling entirely and works
// correctly, so every body-bearing response below goes through this path
// instead of reply.send(stream).
function pipeToRaw(
  reply: FastifyReply,
  stream: NodeJS.ReadableStream,
  statusCode: number,
  headers: Record<string, string | number>
): void {
  reply.hijack();
  reply.raw.writeHead(statusCode, headers);
  stream.on("error", () => {
    reply.raw.destroy();
  });
  stream.pipe(reply.raw);
}

export async function streamFile(
  reply: FastifyReply,
  filePath: string,
  mimeType: string,
  rangeHeader: string | undefined,
  isHead: boolean
): Promise<void> {
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    reply.code(404).send({ error: "File not found on disk" });
    return;
  }

  if (!rangeHeader) {
    const headers = {
      "Accept-Ranges": "bytes",
      "Content-Type": mimeType,
      "Content-Length": size,
    };
    if (isHead) {
      reply.raw.writeHead(200, headers);
      reply.raw.end();
      return;
    }
    pipeToRaw(reply, createReadStream(filePath), 200, headers);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) {
    reply.code(416).header("Content-Range", `bytes */${size}`).send();
    return;
  }

  const [, startStr, endStr] = match;
  let start = startStr ? Number(startStr) : 0;
  let end = endStr ? Number(endStr) : size - 1;

  if (!startStr && endStr) {
    // "bytes=-N" means the last N bytes
    start = Math.max(0, size - Number(endStr));
    end = size - 1;
  }

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= size) {
    reply.code(416).header("Content-Range", `bytes */${size}`).send();
    return;
  }

  const headers = {
    "Accept-Ranges": "bytes",
    "Content-Type": mimeType,
    "Content-Range": `bytes ${start}-${end}/${size}`,
    "Content-Length": end - start + 1,
  };

  if (isHead) {
    reply.raw.writeHead(206, headers);
    reply.raw.end();
    return;
  }

  pipeToRaw(reply, createReadStream(filePath, { start, end }), 206, headers);
}
