import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ITEM_THUMBNAILS_DIR, PERFORMER_IMAGES_DIR } from "../media/cache.js";

const execFileAsync = promisify(execFile);

export const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR ?? "./backups");

// Only files matching this are ever listed, served or deleted — the name
// arrives from the client on download and delete.
export const BACKUP_NAME_PATTERN = /^media-server-[0-9TZ.-]+\.tar\.gz$/;

const DUMP_TIMEOUT_MS = 300_000;
const KEEP_BACKUPS = 10;

// Directories holding things a rescan cannot rebuild. Posters, previews and
// photo thumbnails are deliberately absent: ffmpeg and sharp regenerate them
// from the source videos, and including them would take an archive from a few
// megabytes to tens of gigabytes.
const UPLOAD_DIRS = [
  { name: "item-thumbnails", dir: ITEM_THUMBNAILS_DIR },
  { name: "performer-images", dir: PERFORMER_IMAGES_DIR },
];

// Only one at a time. Reserved synchronously before the first await, the same
// way startScan reserves its slot — two near-simultaneous requests would
// otherwise both pass an `if (running)` check.
let running = false;

export type BackupFile = { name: string; sizeBytes: number; createdAt: string };

function timestamp(): string {
  return new Date().toISOString().replace(/:/g, "-");
}

/**
 * Resolves a client-supplied backup name to a path inside BACKUP_DIR, or null.
 *
 * Both the pattern and the resolved-path check matter: the pattern rejects
 * traversal outright, and re-resolving catches anything it might have missed.
 */
export function resolveBackupPath(name: string): string | null {
  if (!BACKUP_NAME_PATTERN.test(name)) return null;
  const resolved = path.resolve(BACKUP_DIR, name);
  if (path.dirname(resolved) !== BACKUP_DIR) return null;
  return resolved;
}

export async function listBackups(): Promise<BackupFile[]> {
  try {
    const entries = await readdir(BACKUP_DIR);
    const files = await Promise.all(
      entries
        .filter((name) => BACKUP_NAME_PATTERN.test(name))
        .map(async (name) => {
          const info = await stat(path.join(BACKUP_DIR, name));
          return { name, sizeBytes: info.size, createdAt: info.mtime.toISOString() };
        })
    );
    // Newest first — what the UI wants, and what pruning needs.
    return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    // Missing directory just means nothing has been backed up yet.
    return [];
  }
}

/** Drops the oldest archives once there are more than KEEP_BACKUPS. */
async function pruneOldBackups(): Promise<void> {
  const files = await listBackups();
  for (const file of files.slice(KEEP_BACKUPS)) {
    await rm(path.join(BACKUP_DIR, file.name), { force: true });
  }
}

export async function createBackup(): Promise<BackupFile> {
  if (running) throw new Error("A backup is already running");
  running = true;

  const name = `media-server-${timestamp()}.tar.gz`;
  const finalPath = path.join(BACKUP_DIR, name);
  // Built under a .partial name so a crash never leaves a truncated archive
  // sitting there looking restorable.
  const partialPath = `${finalPath}.partial`;
  const workDir = await mkdtemp(path.join(tmpdir(), "media-backup-"));

  try {
    await mkdir(BACKUP_DIR, { recursive: true });

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is not set");

    // Whole database, not --schema=public: drizzle's migration bookkeeping
    // lives in a separate `drizzle` schema, and without it the next boot
    // replays migration 0000 against tables that already exist and dies.
    // --clean/--if-exists make restoring over a populated database idempotent;
    // --no-owner/--no-privileges avoid failures if the role differs.
    await execFileAsync(
      "pg_dump",
      [
        databaseUrl,
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-privileges",
        "--file",
        path.join(workDir, "db.sql"),
      ],
      { timeout: DUMP_TIMEOUT_MS }
    );

    // Uploads are copied *after* the dump, deliberately. An upload writes its
    // file before updating the row, so a dump taken first can only reference
    // files that already exist. The reverse order could capture a row
    // pointing at a file the copy never reached — a dangling reference that
    // cannot be re-derived. This way the worst case is an orphaned file.
    const uploadsDir = path.join(workDir, "uploads");
    await mkdir(uploadsDir, { recursive: true });
    for (const upload of UPLOAD_DIRS) {
      await mkdir(path.join(uploadsDir, upload.name), { recursive: true });
      await execFileAsync("sh", [
        "-c",
        // The trailing /. copies contents rather than the directory itself,
        // and `|| true` keeps an empty or missing source from failing.
        `cp -R ${JSON.stringify(upload.dir)}/. ${JSON.stringify(
          path.join(uploadsDir, upload.name)
        )}/ 2>/dev/null || true`,
      ]);
    }

    await execFileAsync("tar", ["-czf", partialPath, "-C", workDir, "db.sql", "uploads"], {
      timeout: DUMP_TIMEOUT_MS,
    });
    await rename(partialPath, finalPath);

    await pruneOldBackups();

    const info = await stat(finalPath);
    return { name, sizeBytes: info.size, createdAt: info.mtime.toISOString() };
  } catch (err) {
    await rm(partialPath, { force: true });
    throw err;
  } finally {
    await rm(workDir, { recursive: true, force: true });
    running = false;
  }
}
