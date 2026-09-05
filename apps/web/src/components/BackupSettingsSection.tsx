import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, HardDriveDownload, Loader2, Trash2 } from "lucide-react";
import {
  backupDownloadUrl,
  createBackup,
  deleteBackup,
  fetchBackups,
  formatBytes,
} from "@/lib/backupApi";
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

  const { data } = useQuery({ queryKey: ["backups"], queryFn: fetchBackups });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["backups"] });
  }

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

      <p className="text-[11px] leading-relaxed text-muted-foreground/70">
        Poster frames and preview clips are left out on purpose — they're cut from your videos
        and a scan rebuilds them, so leaving them out keeps a backup small enough to run often.
        The newest 10 are kept. To restore one, run{" "}
        <code className="rounded bg-secondary px-1 py-0.5">scripts/restore.sh</code> from a
        terminal; the app has to be stopped while its database is replaced.
      </p>
    </SettingsSection>
  );
}
