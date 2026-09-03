import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";

type ScanJob = {
  id: number;
  status: "running" | "completed" | "failed";
  filesScanned: number;
  filesTotal: number | null;
  error: string | null;
};

async function startScan(): Promise<{ id: number }> {
  const res = await fetch("/api/scan", { method: "POST" });
  if (!res.ok) {
    throw new Error(`Failed to start scan: ${res.status}`);
  }
  return res.json();
}

async function fetchScanJob(id: number): Promise<ScanJob> {
  const res = await fetch(`/api/scan/${id}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch scan status: ${res.status}`);
  }
  return res.json();
}

export function RescanButton() {
  const [jobId, setJobId] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const startMutation = useMutation({
    mutationFn: startScan,
    onSuccess: (data) => {
      setLastError(null);
      setJobId(data.id);
    },
  });

  const { data: job } = useQuery({
    queryKey: ["scan-job", jobId],
    queryFn: () => fetchScanJob(jobId!),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") {
        return false;
      }
      return 1000;
    },
  });

  // Runs once when a tracked job finishes, as a proper effect rather than a
  // side effect during render (which would risk double-firing under
  // StrictMode's double-invoked renders).
  useEffect(() => {
    if (jobId === null || !job) return;
    if (job.status === "completed" || job.status === "failed") {
      queryClient.invalidateQueries({ queryKey: ["media-items"] });
      if (job.status === "failed") setLastError(job.error);
      setJobId(null);
    }
  }, [job, jobId, queryClient]);

  const isRunning = job?.status === "running" || startMutation.isPending;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => startMutation.mutate()}
        disabled={isRunning}
        className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
      >
        {isRunning ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        Rescan
      </button>
      {isRunning && job && (
        <span className="text-xs text-muted-foreground">
          {job.filesScanned} file{job.filesScanned === 1 ? "" : "s"} scanned…
        </span>
      )}
      {lastError && <span className="text-xs text-destructive">{lastError}</span>}
    </div>
  );
}
