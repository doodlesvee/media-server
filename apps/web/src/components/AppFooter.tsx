import { useQuery } from "@tanstack/react-query";
import { Clapperboard } from "lucide-react";
import { Link } from "@tanstack/react-router";

type Stats = {
  videos: number;
  photos: number;
  folders: number;
  /** Bytes on disk, across every file the library can currently see. */
  totalBytes: number;
  tags: number;
  collections: number;
};

/**
 * Binary units, because that's what a filesystem reports — a 2TB drive shows
 * as 1.8TB in Finder, and a footer that disagreed with the OS would just be
 * confusing.
 */
function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  // One decimal once past megabytes; a fractional byte count is noise.
  return `${value.toFixed(exponent >= 2 ? 1 : 0)} ${units[exponent]}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function AppFooter() {
  // Same query key the sidebar used to use, so React Query serves this from
  // cache rather than issuing a second request for the same data.
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => fetchJson<Stats>("/api/stats"),
  });

  return (
    <footer className="mt-auto border-t border-border px-6 py-5 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <Clapperboard className="size-3.5" />
          <span className="font-medium text-foreground/80">Media Server</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-muted-foreground/40">·</span>
          {/* Two shortcuts have no button anywhere — this is how you'd find
              out they exist at all. */}
          <Link to="/help" className="transition-colors hover:text-foreground">
            Shortcuts
          </Link>
          <span className="text-muted-foreground/40">·</span>
          <a
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            API docs
          </a>
        </div>

        {/* Lives here rather than in the sidebar so collapsing the rail never
            hides it. */}
        {stats && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-foreground/80">{stats.videos} videos</span>
            {stats.photos > 0 && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>{stats.photos} photos</span>
              </>
            )}
            <span className="text-muted-foreground/40">·</span>
            <span>{stats.folders} folders</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{stats.tags} tags</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{stats.collections} collections</span>
            {stats.totalBytes > 0 && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-foreground/80">{formatSize(stats.totalBytes)}</span>
              </>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
