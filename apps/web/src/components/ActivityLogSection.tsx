import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Database, FileEdit, FolderSync, Shield, Trash2 } from "lucide-react";

 type ActivityEvent = {
  id: number;
  type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

const ICONS = {
  scan: FolderSync,
  backup: Archive,
  metadata: FileEdit,
  collection: Database,
  privacy: Shield,
  cache: Database,
} as const;

async function fetchActivity(): Promise<{ events: ActivityEvent[] }> {
  const response = await fetch("/api/activity?limit=100");
  if (!response.ok) throw new Error(`Activity request failed: ${response.status}`);
  return response.json();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}

export function ActivityLogSection() {
  const queryClient = useQueryClient();
  const { data, isError, isLoading } = useQuery({
    queryKey: ["activity"],
    queryFn: fetchActivity,
  });
  const clear = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/activity", { method: "DELETE" });
      if (!response.ok) throw new Error(`Failed to clear activity: ${response.status}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["activity"] }),
  });

  if (isLoading) return <div className="skeleton h-64 rounded-lg" />;
  if (isError || !data) {
    return <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">Activity log is unavailable.</p>;
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card/60 p-5" aria-labelledby="activity-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="activity-title" className="text-base font-semibold">Activity</h2>
          <p className="mt-1 text-sm text-muted-foreground">Important library events, without sensitive media details.</p>
        </div>
        {data.events.length > 0 && (
          <button
            type="button"
            onClick={() => clear.mutate()}
            disabled={clear.isPending}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="size-3.5" /> Clear
          </button>
        )}
      </div>

      {data.events.length === 0 ? (
        <p className="rounded-md bg-secondary/50 px-3 py-4 text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ol className="divide-y divide-border">
          {data.events.map((event) => {
            const Icon = ICONS[event.type as keyof typeof ICONS] ?? Database;
            return (
              <li key={event.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 text-sm">{event.message}</span>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={event.createdAt}>
                  {formatDate(event.createdAt)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
