import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

const CHUNK_SIZE = 1024 * 1024; // 1MB

// Partial hash, not a full-file hash: reading the first + last chunk of a large
// video is enough to detect a move/rename cheaply without hashing gigabytes on
// every scan. Known limitation: two files with genuinely identical content
// (true duplicates, not a move) will collide here and get treated as the same
// item — acceptable for Phase 2, real duplicate handling is a later phase.
export async function partialContentHash(filePath: string, sizeBytes: number): Promise<string> {
  const hash = createHash("sha256");
  const fh = await open(filePath, "r");
  try {
    const headSize = Math.min(CHUNK_SIZE, sizeBytes);
    const headBuf = Buffer.alloc(headSize);
    await fh.read(headBuf, 0, headSize, 0);
    hash.update(headBuf);

    if (sizeBytes > CHUNK_SIZE) {
      const tailSize = Math.min(CHUNK_SIZE, sizeBytes - headSize);
      if (tailSize > 0) {
        const tailBuf = Buffer.alloc(tailSize);
        await fh.read(tailBuf, 0, tailSize, sizeBytes - tailSize);
        hash.update(tailBuf);
      }
    }

    hash.update(String(sizeBytes));
    return hash.digest("hex");
  } finally {
    await fh.close();
  }
}
