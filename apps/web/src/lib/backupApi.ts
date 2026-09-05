export type BackupFile = { name: string; sizeBytes: number; createdAt: string };

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
