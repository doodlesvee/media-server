import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy, HardDrive, Library, ScanLine } from "lucide-react";
import { Link } from "@tanstack/react-router";

 type HealthStats = {
  videos: number;
  photos: number;
  folders: number;
  totalBytes: number;
  totalItems: number;
  missing: number;
  duplicateGroups: number;
  lastScan: { status: string; finishedAt: string | null; startedAt: string } | null;
  lastBackup: string | null;
};

async function fetchHealth(): Promise<HealthStats> {
  const response = await fetch("/api/stats");
  if (!response.ok) throw new Error(`Health request failed: ${response.status}`);
  return response.json();
}

function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent >= 2 ? 1 : 0)} ${units[exponent]}`;
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}

export function LibraryHealthSection() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["library-health"],
    queryFn: fetchHealth,
    staleTime: 30_000,
  });

  if (isLoading) {
    return <div className="skeleton h-72 rounded-lg" />;
  }
  if (isError || !data) {
    return <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">Library health is unavailable.</p>;
  }

  const available = Math.max(0, data.totalItems - data.missing);
  const healthPercent = data.totalItems ? Math.round((available / data.totalItems) * 100) : 100;
  const scanHealthy = data.lastScan?.status === "completed";

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card/60 p-5" aria-labelledby="library-health-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Library className="size-4 text-muted-foreground" />
            <h2 id="library-health-title" className="text-base font-semibold">Library health</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">A quick read on what is available and what needs attention.</p>
        </div>
        <span className="text-2xl font-semibold tabular-nums">{healthPercent}%</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-secondary" aria-label={`${healthPercent}% of library available`}>
        <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${healthPercent}%` }} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Metric icon={Library} label="Total items" value={data.totalItems.toLocaleString()} />
        <Metric icon={CheckCircle2} label="Available" value={available.toLocaleString()} tone="positive" />
        <Metric
          icon={AlertTriangle}
          label="Missing"
          value={data.missing.toLocaleString()}
          tone={data.missing > 0 ? "warning" : "positive"}
          href="/browse"
        />
        <Metric
          icon={Copy}
          label="Duplicate groups"
          value={data.duplicateGroups.toLocaleString()}
          tone={data.duplicateGroups > 0 ? "warning" : "positive"}
        />
        <Metric icon={HardDrive} label="Storage" value={formatSize(data.totalBytes)} />
        <Metric icon={ScanLine} label="Last scan" value={data.lastScan ? `${data.lastScan.status} · ${formatDate(data.lastScan.finishedAt ?? data.lastScan.startedAt)}` : "Never"} tone={scanHealthy ? "positive" : "neutral"} />
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>{data.videos.toLocaleString()} videos</span>
        <span>{data.photos.toLocaleString()} photos</span>
        <span>Last backup: {formatDate(data.lastBackup)}</span>
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = "neutral",
  href,
}: {
  icon: typeof Library;
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "warning";
  href?: "/browse";
}) {
  const content = (
    <div className="flex items-center gap-3 rounded-md border border-border/70 bg-background/40 px-3 py-2.5">
      <Icon className={tone === "warning" ? "size-4 text-amber-500" : "size-4 text-muted-foreground"} />
      <span className="min-w-0 flex-1 text-sm text-muted-foreground">{label}</span>
      <strong className="text-sm tabular-nums text-foreground">{value}</strong>
    </div>
  );
  return href ? <Link to={href}>{content}</Link> : content;
}
