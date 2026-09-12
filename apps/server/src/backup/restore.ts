import { execFile } from "node:child_process";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { logActivity } from "../activity/log.js";
import { db, drainPool, runMigrations } from "../db/client.js";
import { latestMigration } from "../db/journal.js";
import { seed, seedCategories } from "../db/seed.js";
import { APP_DATA_ROOT } from "../media/cache.js";
import { restartScanSchedule, stopScanSchedule } from "../scanner/schedule.js";
import { isScanRunning } from "../scanner/pipeline.js";
import {
  createBackup,
  isBackupRunning,
  resolveBackupPath,
  type BackupFile,
} from "./create.js";
import {
  claimRestore,
  clearRestoreMarker,
  releaseRestore,
  writeRestoreMarker,
} from "./restoreState.js";

const execFileAsync = promisify(execFile);

const PSQL_TIMEOUT_MS = 600_000;

// psql -f prints a command tag per statement and, because the dump is
// --if-exists, a "NOTICE: ... skipping" for every object that isn't there
// yet. execFile's default maxBuffer is 1 MB, and overflowing it does not
// truncate the output — it SIGTERMs the child, which here means killing psql
// part-way through a restore. createBackup never hit this only because
// pg_dump --file writes nothing to stdout.
const PSQL_MAX_BUFFER = 32 * 1024 * 1024;

/** Carries the HTTP status the route should answer with. */
export class RestoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RestoreError";
  }
}

export type RestoreResult = {
  ok: true;
  source: string;
  safetyBackup: string | null;
  migrated: boolean;
  uploads: string[];
};

type ArchiveMeta = {
  createdAt?: string;
  latestMigrationTag?: string | null;
  latestMigrationWhen?: number | null;
};

/**
 * Confirms the archive contains only what a backup of ours contains.
 *
 * The name is already constrained to BACKUP_DIR by resolveBackupPath, so this
 * is about the *contents*: a tar member like `../../etc/something` or an
 * absolute path would otherwise be written wherever it pointed when extracted.
 * Anything outside `db.sql`, `meta.json` and a single level of `uploads/<dir>/`
 * means this is not one of ours, and the safe response is to stop rather than
 * guess.
 */
export function validateArchiveMembers(members: string[]): string[] {
  const uploads = new Set<string>();
  for (const raw of members) {
    const member = raw.replace(/\/+$/, "");
    if (member === "" || member === ".") continue;
    if (member.startsWith("/") || member.split("/").includes("..")) {
      throw new RestoreError(`Archive contains an unsafe path: ${raw}`, 400);
    }
    if (member === "db.sql" || member === "meta.json") continue;
    const parts = member.split("/");
    if (parts[0] !== "uploads") {
      throw new RestoreError(`Archive contains an unexpected entry: ${raw}`, 400);
    }
    if (parts.length >= 2 && parts[1]) uploads.add(parts[1]);
  }
  return [...uploads].sort();
}

/**
 * Refuses a dump taken by a newer version of the app.
 *
 * Drizzle's migrator only ever reads the *local* journal, comparing each entry
 * against the single newest row in __drizzle_migrations. A database already
 * past every local migration therefore matches nothing, so migrate() skips the
 * lot and returns successfully — leaving the app querying a schema it does not
 * model, with columns renamed or dropped out from under it. Nothing later
 * catches that, so it has to be caught here.
 */
export async function assertRestorable(meta: ArchiveMeta | null): Promise<void> {
  const local = await latestMigration();
  const archiveWhen = meta?.latestMigrationWhen;
  if (typeof archiveWhen !== "number" || !local) return;
  if (archiveWhen > local.when) {
    throw new RestoreError(
      `This backup was taken by a newer version of the app ` +
        `(${meta?.latestMigrationTag ?? "unknown"}) than the one running ` +
        `(${local.tag}). Update first, then restore.`,
      409,
    );
  }
}

async function readArchiveMeta(dir: string): Promise<ArchiveMeta | null> {
  try {
    return JSON.parse(
      await readFile(path.join(dir, "meta.json"), "utf8"),
    ) as ArchiveMeta;
  } catch {
    // Archives predating the manifest. They are older than this feature by
    // definition, so the version gate has nothing to check — the caller logs
    // that it was skipped rather than letting it pass silently.
    return null;
  }
}

/**
 * Replaces the database and uploaded images with the contents of an archive.
 *
 * Runs in-process rather than as the stop-the-container script it used to be:
 * runMigrations() is exported and retries its connection, so the app can swap
 * its own database and then bring an older dump up to current code itself.
 *
 * The ordering is load-bearing throughout — see the comments at each step.
 */
export async function restoreBackup(name: string): Promise<RestoreResult> {
  // Reserved before the first await, the same way createBackup and startScan
  // reserve theirs: two near-simultaneous requests would both pass a plain
  // `if (restoring)` check and race each other into psql.
  if (!claimRestore()) {
    throw new RestoreError("A restore is already running", 409);
  }

  let workDir: string | null = null;
  try {
    if (isScanRunning()) {
      throw new RestoreError(
        "A library scan is running — wait for it to finish",
        409,
      );
    }
    if (isBackupRunning()) {
      throw new RestoreError("A backup is running — wait for it to finish", 409);
    }

    const archivePath = resolveBackupPath(name);
    if (!archivePath) throw new RestoreError("Invalid backup name", 400);

    // The timer cannot be stopped by the HTTP gate, and a scan starting
    // mid-restore would insert into tables being dropped.
    stopScanSchedule();

    // Inside APP_DATA_ROOT, not tmpdir(): the uploads are swapped into place
    // with rename(), which fails EXDEV across filesystems — and /tmp is the
    // container's writable layer while app-data is a mounted volume.
    workDir = await mkdtemp(path.join(APP_DATA_ROOT, ".restore-"));

    // Worked on from a copy so the restore never depends on the original
    // surviving — including surviving the safety backup's own pruning.
    const localArchive = path.join(workDir, "archive.tar.gz");
    await copyFile(archivePath, localArchive);

    const listed = await execFileAsync("tar", ["-tzf", localArchive], {
      maxBuffer: PSQL_MAX_BUFFER,
    });
    const uploadDirs = validateArchiveMembers(listed.stdout.split("\n"));

    const extractDir = path.join(workDir, "extracted");
    await execFileAsync("tar", [
      "-xzf",
      localArchive,
      "--no-same-owner",
      "-C",
      await mkdirp(extractDir),
    ]);

    const dumpPath = path.join(extractDir, "db.sql");
    if (!(await exists(dumpPath))) {
      throw new RestoreError("Archive has no db.sql — is this a backup?", 400);
    }

    const meta = await readArchiveMeta(extractDir);
    await assertRestorable(meta);

    // After the gate, never before: anything written between this snapshot and
    // psql would be captured by neither the safety backup nor the dump, and so
    // would be lost with no way back.
    const safety = await takeSafetyBackup(name);

    // The barrier. An idle connection holds no locks, but one mid-query holds
    // ACCESS SHARE, which blocks the DROPs — forever, since nothing sets a
    // lock_timeout by default. A failure here must abort rather than proceed.
    await drainPool();

    await writeRestoreMarker({
      startedAt: new Date().toISOString(),
      source: name,
      safetyBackup: safety?.name ?? null,
    });

    await runPsql(dumpPath);

    const uploads = await swapUploads(extractDir, uploadDirs);

    // Fresh connections, then everything app.ts does on boot. Replaying only
    // the migrations would leave seed rows missing from a dump taken before
    // they existed, and the scan timer armed from pre-restore settings.
    await drainPool();
    const migrated = await bringSchemaUpToDate();
    await seed();
    await seedCategories();
    await restartScanSchedule();

    await clearRestoreMarker();
    // Written only now: the old database, and any activity row in it, stopped
    // existing several steps ago.
    await logActivity("backup", `Restored from ${name}`, {
      name,
      safetyBackup: safety?.name ?? null,
      migrated,
    });

    return {
      ok: true,
      source: name,
      safetyBackup: safety?.name ?? null,
      migrated,
      uploads,
    };
  } catch (err) {
    await clearRestoreMarker();
    // Re-arm on the way out. psql runs the dump in a single transaction, so a
    // failure there has left the database exactly as it was and there is a
    // working library here to keep scanning.
    await restartScanSchedule().catch(() => {});
    throw err;
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true });
    releaseRestore();
  }
}

async function mkdirp(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  return dir;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Snapshots the current state so a restore is undoable.
 *
 * `protect` keeps the archive being restored from out of the pruning that this
 * extra backup would otherwise trigger — see pruneOldBackups. A failure to
 * snapshot is fatal on purpose: proceeding would destroy the library with no
 * way back, which is precisely what this exists to prevent.
 */
async function takeSafetyBackup(source: string): Promise<BackupFile | null> {
  try {
    return await createBackup({
      protect: source,
      reason: "Safety backup before restore",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RestoreError(
      `Could not take a safety backup first, so nothing was changed: ${message}`,
      500,
    );
  }
}

async function runPsql(dumpPath: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new RestoreError("DATABASE_URL is not set", 500);

  try {
    await execFileAsync(
      "psql",
      [
        databaseUrl,
        // --single-transaction is the whole safety story: the dump is taken
        // --clean --if-exists, so every DROP is a no-op rather than an error
        // on an object that isn't there, which is exactly what lets the run
        // sit inside one transaction. A failure part-way therefore rolls back
        // and leaves the database byte-identical to before, turning "your
        // database is now wrecked" into "nothing happened".
        "--single-transaction",
        "-v",
        "ON_ERROR_STOP=1",
        // Quiet, because the output is bounded by maxBuffer and a per-statement
        // command tag on a large dump is a lot of it.
        "-q",
        "-f",
        dumpPath,
      ],
      {
        timeout: PSQL_TIMEOUT_MS,
        maxBuffer: PSQL_MAX_BUFFER,
        env: {
          ...process.env,
          // A straggler connection we failed to drain should fail this fast
          // rather than block the DROP indefinitely — and with it every reader
          // that queues behind the lock request.
          PGOPTIONS: "-c lock_timeout=10s",
        },
      },
    );
  } catch (err) {
    throw new RestoreError(
      `Restoring the database failed, so it was rolled back and nothing ` +
        `changed: ${psqlFailure(err, databaseUrl)}`,
      500,
    );
  }
}

/**
 * The reason psql failed, without the connection string.
 *
 * execFile puts the whole argv in its message, and argv[0] here is
 * DATABASE_URL — password included. That message is surfaced verbatim in the
 * UI and written to the activity log, so it has to be scrubbed rather than
 * merely truncated. psql's own explanation is on stderr, which is the part
 * actually worth reading.
 */
function psqlFailure(err: unknown, databaseUrl: string): string {
  const stderr =
    typeof err === "object" && err && "stderr" in err
      ? String((err as { stderr?: unknown }).stderr ?? "").trim()
      : "";
  const message = err instanceof Error ? err.message : String(err);
  return (stderr || message).split(databaseUrl).join("<database url>");
}

/**
 * Swaps the archive's uploaded images into place, one directory at a time.
 *
 * Iterates what the archive actually holds rather than the current
 * UPLOAD_DIRS. scripts/restore.sh carries the scar for this: it named two
 * directories while the backup had grown a third, so kind-covers restored to
 * nothing and only during a real recovery would anyone find out. `name` is a
 * plain basename under APP_DATA_ROOT by construction (cache.test.ts enforces
 * it), so the archive describes its own destinations.
 *
 * Replace, not merge: `cp -R src/. dst/` would leave files belonging to the
 * destroyed install sitting among the restored ones, referenced by nothing.
 * The safety backup is what makes replacing safe.
 */
async function swapUploads(
  extractDir: string,
  uploadDirs: string[],
): Promise<string[]> {
  const restored: string[] = [];
  for (const name of uploadDirs) {
    const staged = path.join(extractDir, "uploads", name);
    if (!(await exists(staged))) continue;
    const target = path.join(APP_DATA_ROOT, name);
    const displaced = `${target}.replaced-${Date.now()}`;

    // Move the current one aside before moving the new one in, so the window
    // where neither is in place is a single rename wide.
    if (await exists(target)) await rename(target, displaced);
    try {
      await rename(staged, target);
    } catch (err) {
      if (await exists(displaced)) await rename(displaced, target);
      throw err;
    }
    await rm(displaced, { recursive: true, force: true });
    restored.push(name);
  }
  return restored;
}

/**
 * Replays any migrations the dump predates, reporting whether it had to.
 *
 * Compared before and after rather than inferred: the migrator is silent about
 * what it did, and "did this old backup need bringing forward" is the one
 * thing worth telling the user afterwards.
 */
async function bringSchemaUpToDate(): Promise<boolean> {
  const before = await currentDbMigration();
  await runMigrations();
  const after = await currentDbMigration();
  return before !== after;
}

async function currentDbMigration(): Promise<number | null> {
  try {
    const rows = await db.execute<{ created_at: string | number | null }>(
      sql`select created_at from drizzle.__drizzle_migrations
          order by created_at desc limit 1`,
    );
    const value = rows.rows[0]?.created_at;
    return value == null ? null : Number(value);
  } catch {
    return null;
  }
}
