import { Clapperboard } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatBytes, useLibraryStats } from "@/lib/statsApi";

export function AppFooter() {
  // Shares one cache entry with the sidebar, notification centre and settings
  // panel, so this is served from cache rather than a second request.
  const { data: stats } = useLibraryStats();

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
                <span className="text-foreground/80">{formatBytes(stats.totalBytes)}</span>
              </>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
