import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  HardDriveDownload,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import {
  backupDownloadUrl,
  createBackup,
  deleteBackup,
  fetchBackups,
  formatBytes,
  PrivacyLockedError,
  restoreBackup,
  type BackupFile,
  type RestoreResult,
} from "@/lib/backupApi";
import { usePrivacyGuard } from "@/lib/privacyGuard";
import { PrivacyUnlockForm } from "./PrivacyUnlockForm";
import { RestoreBackupDialog } from "./RestoreBackupDialog";
import { SettingsSection } from "./SettingsSection";

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function BackupSettingsSection() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { guarded, hasPassword, hasPasskey } = usePrivacyGuard();

  // Which archive the confirmation is open for, and whether this session has
  // proved the credential. Both reset together: an expired unlock has to send
  // you back to the prompt, not leave a primed Restore button sitting there.
  const [pendingRestore, setPendingRestore] = useState<BackupFile | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [restored, setRestored] = useState<RestoreResult | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ["backups"], queryFn: fetchBackups });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["backups"] });
  }

  const restore = useMutation({
    mutationFn: restoreBackup,
    onSuccess: (result) => {
      // No invalidation. The session this page is holding was replaced along
      // with everything else, so every refetch would 401 — and a wall of
      // failures is a poor way to learn the restore worked.
      setRestoreError(null);
      setPendingRestore(null);
      setRestored(result);
    },
    onError: (err: Error) => {
      if (err instanceof PrivacyLockedError) {
        setUnlocked(false);
        setPendingRestore(null);
        setRestoreError(null);
        return;
      }
      setRestoreError(err.message);
    },
  });

  const create = useMutation({
    mutationFn: createBackup,
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({ mutationFn: deleteBackup, onSuccess: refresh });
  const backups = data?.backups ?? [];

  // Terminal on purpose. The session is gone, so there is nothing useful left
  // for this page to do and every control on it would fail; the one honest
  // next step is signing in again.
  if (restored) {
    return (
      <SettingsSection
        title="Backup"
        description="The library was replaced with the contents of a backup."
      >
        <div className="space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
            <h3 className="font-semibold tracking-tight">Restored</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Restored from{" "}
            <span className="font-mono text-foreground">{restored.source}</span>
            {restored.migrated && " and brought up to the current schema"}.
          </p>
          {restored.safetyBackup && (
            <p className="text-xs text-muted-foreground">
              The library as it was beforehand was saved as{" "}
              <span className="font-mono">{restored.safetyBackup}</span> — restore
              that to undo this.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Sign in with the password you had when that backup was taken, then
            run a scan to rebuild poster frames and preview clips.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition-transform hover:scale-[1.02]"
          >
            Sign in again
          </button>
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="Backup"
      description="Everything that can't be rebuilt from your video files: the whole database and any images you've uploaded."
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
        >
          {create.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <HardDriveDownload className="size-4" />
          )}
          Back up now
        </button>
        {backups.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Last: {relativeDate(backups[0].createdAt)}
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {backups.length > 0 ? (
        <ul className="space-y-1">
          {backups.map((backup) => (
            <li
              key={backup.name}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs"
            >
              <span className="min-w-0 flex-1 truncate font-mono">{backup.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {formatBytes(backup.sizeBytes)}
              </span>
              <span className="shrink-0 text-muted-foreground/70">
                {relativeDate(backup.createdAt)}
              </span>
              <a
                href={backupDownloadUrl(backup.name)}
                download
                aria-label={`Download ${backup.name}`}
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <Download className="size-3.5" />
              </a>
              <button
                type="button"
                onClick={() => {
                  setRestoreError(null);
                  setPendingRestore(backup);
                }}
                disabled={restore.isPending}
                aria-label={`Restore ${backup.name}`}
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <RotateCcw className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove.mutate(backup.name)}
                disabled={remove.isPending}
                aria-label={`Delete ${backup.name}`}
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No backups yet.</p>
      )}

      {pendingRestore && guarded && !unlocked && (
        <div className="space-y-3 rounded-lg border border-border bg-card/60 p-4">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="size-5 shrink-0 text-amber-500" />
            <h3 className="font-semibold tracking-tight">Locked</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Restoring replaces your whole library. Unlock it with your privacy{" "}
            {hasPasskey && hasPassword
              ? "passkey or password"
              : hasPasskey
                ? "passkey"
                : "password"}
            .
          </p>
          <PrivacyUnlockForm
            onUnlocked={() => setUnlocked(true)}
            onCancel={() => setPendingRestore(null)}
          />
        </div>
      )}

      {pendingRestore && (!guarded || unlocked) && (
        <RestoreBackupDialog
          backup={pendingRestore}
          pending={restore.isPending}
          error={restoreError}
          onConfirm={() => restore.mutate(pendingRestore.name)}
          onCancel={() => {
            setPendingRestore(null);
            setRestoreError(null);
          }}
        />
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground/70">
        Poster frames and preview clips are left out on purpose — they're cut from your videos
        and a scan rebuilds them, so leaving them out keeps a backup small enough to run often.
        The newest 10 are kept, and the one you restore from is never pruned.
        Restoring replaces the whole library and signs you out; a backup of the
        current state is taken first so it can be undone. On a fresh install,
        drop an archive into the{" "}
        <code className="rounded bg-secondary px-1 py-0.5">backups</code> folder
        and it appears here.
      </p>
    </SettingsSection>
  );
}
