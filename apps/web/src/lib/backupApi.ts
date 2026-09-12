export type BackupFile = { name: string; sizeBytes: number; createdAt: string };

export type RestoreResult = {
  ok: true;
  source: string;
  /** The snapshot taken of the pre-restore library, so this is undoable. */
  safetyBackup: string | null;
  /** Whether the archive predated the current schema and had to be migrated. */
  migrated: boolean;
  uploads: string[];
};

/**
 * Thrown when the server says this session has not proved the privacy
 * credential. Its own class so the panel can drop back to the prompt rather
 * than showing a raw failure for a state with an obvious remedy — including
 * when the fifteen-minute unlock simply expired while the page sat open.
 */
export class PrivacyLockedError extends Error {
  constructor() {
    super("Locked");
    this.name = "PrivacyLockedError";
  }
}

/**
 * Replaces the entire library with the contents of an archive.
 *
 * Deliberately has no timeout. The request holds open for the whole restore —
 * seconds to a minute — and abandoning it client-side would not stop the
 * server, it would only lose the one account of what happened.
 */
export async function restoreBackup(name: string): Promise<RestoreResult> {
  const res = await fetch(`/api/backups/${encodeURIComponent(name)}/restore`, {
    method: "POST",
  });
  const data = (await res.json().catch(() => null)) as
    | (Partial<RestoreResult> & { error?: string; code?: string })
    | null;
  if (res.status === 403 && data?.code === "privacy_locked") {
    throw new PrivacyLockedError();
  }
  if (!res.ok) throw new Error(data?.error ?? `Restore failed: ${res.status}`);
  return data as RestoreResult;
}

export async function fetchBackups(): Promise<{ backups: BackupFile[] }> {
  const res = await fetch("/api/backups");
  if (!res.ok) throw new Error(`Failed to load backups: ${res.status}`);
  return res.json();
}

export async function createBackup(): Promise<{ backup: BackupFile }> {
  const res = await fetch("/api/backups", { method: "POST" });
  const data = (await res.json().catch(() => null)) as
    | { backup?: BackupFile; error?: string }
    | null;
  if (!res.ok) throw new Error(data?.error ?? `Backup failed: ${res.status}`);
  return data as { backup: BackupFile };
}

export async function deleteBackup(name: string): Promise<void> {
  const res = await fetch(`/api/backups/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete backup: ${res.status}`);
}

export function backupDownloadUrl(name: string): string {
  return `/api/backups/${encodeURIComponent(name)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
