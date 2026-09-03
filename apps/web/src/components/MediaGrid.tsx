import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Film, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaViewer } from "./MediaViewer";

type MediaItem = {
  id: number;
  itemType: "video" | "photo" | "folder";
  title: string;
  durationSeconds: number | null;
  missingSince: string | null;
  playbackWarning: string | null;
};

type MediaItemsResponse = {
  items: MediaItem[];
  page: number;
  pageSize: number;
};

async function fetchMediaItems(): Promise<MediaItemsResponse> {
  const res = await fetch("/api/media-items");
  if (!res.ok) {
    throw new Error(`Failed to load media items: ${res.status}`);
  }
  return res.json();
}

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function MediaThumbnail({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return item.itemType === "video" ? (
      <Film className="size-8 text-muted-foreground" />
    ) : (
      <ImageIcon className="size-8 text-muted-foreground" />
    );
  }

  return (
    <img
      src={`/api/media-items/${item.id}/thumbnail`}
      alt=""
      onError={() => setFailed(true)}
      className="aspect-video w-full rounded object-cover"
    />
  );
}

export function MediaGrid() {
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const { data, error, isLoading } = useQuery({
    queryKey: ["media-items"],
    queryFn: fetchMediaItems,
  });

  if (isLoading) {
    return <p className="text-muted-foreground">Loading library…</p>;
  }

  if (error) {
    return <p className="text-destructive">Could not load the library.</p>;
  }

  if (!data || data.items.length === 0) {
    return (
      <p className="text-muted-foreground">
        No media found yet. Run a scan to pick up files from your library.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {data.items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelected(item)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-center hover:bg-accent",
              item.missingSince && "opacity-50"
            )}
          >
            <MediaThumbnail item={item} />
            <span className="line-clamp-2 text-sm">{item.title}</span>
            {item.durationSeconds !== null && (
              <span className="font-mono text-xs text-muted-foreground">
                {formatDuration(item.durationSeconds)}
              </span>
            )}
            {item.missingSince && <span className="text-xs text-destructive">missing</span>}
          </button>
        ))}
      </div>

      {selected && <MediaViewer item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
