import { describe, expect, it } from "vitest";
import {
  RestoreError,
  assertRestorable,
  validateArchiveMembers,
} from "./restore.js";
import { backupsToPrune } from "./create.js";
import { latestMigration } from "../db/journal.js";

/**
 * The two checks that stand between a restore and a broken library.
 *
 * Both are pure over their inputs on purpose — the surrounding orchestration
 * shells out to psql and tar, which the host running `npm test` may not have,
 * so the parts worth guarding are the ones that decide whether to shell out
 * at all.
 */
describe("archive member validation", () => {
  it("accepts the shape a backup actually has", () => {
    expect(
      validateArchiveMembers([
        "db.sql",
        "meta.json",
        "uploads/",
        "uploads/performer-images/",
        "uploads/performer-images/3-abc.jpg",
        "uploads/kind-covers/movies-1.jpg",
        "",
      ]),
    ).toEqual(["kind-covers", "performer-images"]);
  });

  it("refuses a member that escapes the extract directory", () => {
    // Extraction happens as the app user with write access to its own data
    // directory, so a `..` member is a write wherever it points.
    expect(() =>
      validateArchiveMembers(["db.sql", "uploads/../../etc/passwd"]),
    ).toThrow(RestoreError);
    expect(() => validateArchiveMembers(["/etc/passwd"])).toThrow(RestoreError);
  });

  it("refuses an archive carrying anything it shouldn't", () => {
    expect(() =>
      validateArchiveMembers(["db.sql", "payload.sh"]),
    ).toThrow(/unexpected entry/);
  });
});

describe("version gate", () => {
  it("refuses a dump taken by a newer version than the code running", async () => {
    const local = await latestMigration();
    expect(local).not.toBeNull();

    await expect(
      assertRestorable({
        latestMigrationTag: "9999_from_the_future",
        latestMigrationWhen: local!.when + 1,
      }),
    ).rejects.toThrow(/newer version/);
  });

  it("allows a dump at or behind the current migration level", async () => {
    const local = await latestMigration();
    await expect(
      assertRestorable({ latestMigrationWhen: local!.when }),
    ).resolves.toBeUndefined();
    await expect(
      assertRestorable({ latestMigrationWhen: 0 }),
    ).resolves.toBeUndefined();
  });

  it("allows archives predating the manifest", async () => {
    // Older than this feature by definition, so there is nothing to compare;
    // refusing them would make the backups already on disk unrestorable.
    await expect(assertRestorable(null)).resolves.toBeUndefined();
    await expect(assertRestorable({})).resolves.toBeUndefined();
  });
});

describe("pruning", () => {
  const at = (n: number) => ({
    name: `media-server-${n}.tar.gz`,
    sizeBytes: 1,
    createdAt: String(n),
  });
  // Newest first, the order listBackups() returns.
  const eleven = Array.from({ length: 11 }, (_, i) => at(11 - i));

  it("drops the oldest once past the cap", () => {
    expect(backupsToPrune(eleven)).toEqual(["media-server-1.tar.gz"]);
    expect(backupsToPrune(eleven.slice(0, 10))).toEqual([]);
  });

  it("never prunes the archive a restore is reading from", () => {
    // The regression. A safety backup taken at the cap evicts the oldest, and
    // the oldest is exactly what someone restoring reaches for.
    expect(backupsToPrune(eleven, "media-server-1.tar.gz")).toEqual([]);
  });

  it("still prunes when the protected archive is not the one at risk", () => {
    // Guards the guard: protecting something safe must not stop pruning
    // altogether, or the cap quietly stops applying.
    expect(backupsToPrune(eleven, "media-server-11.tar.gz")).toEqual([
      "media-server-1.tar.gz",
    ]);
  });
});
