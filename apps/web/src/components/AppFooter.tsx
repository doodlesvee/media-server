import { useQuery } from "@tanstack/react-query";
import { Clapperboard } from "lucide-react";

type Stats = {
  videos: number;
  photos: number;
  folders: number;
  tags: number;
  collections: number;
};

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
          </div>
        )}
      </div>
    </footer>
  );
}
