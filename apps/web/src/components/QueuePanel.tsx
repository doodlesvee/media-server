import { ChevronDown, ChevronUp, List, Play, X } from "lucide-react";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { useQueue } from "@/lib/queue";

export function QueuePanel({
  onPlay,
}: {
  onPlay: (id: number) => void;
}) {
  const { items, clear, move, remove } = useQueue();

  return (
    <section className="border-t border-border bg-secondary/30 p-5" aria-label="Playback queue">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <List className="size-4" />
          Queue <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-xs text-muted-foreground transition-colors hover:text-destructive"
          >
            Clear
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add videos here to play them next.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((queueItem, index) => (
            <li key={queueItem.id} className="flex items-center gap-2 rounded-md bg-background/60 p-2">
              <img
                src={thumbnailUrl(queueItem)}
                alt=""
                className="size-12 rounded object-cover"
              />
              <button
                type="button"
                onClick={() => onPlay(queueItem.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm hover:text-foreground"
              >
                <span className="min-w-0 flex-1 truncate">{queueItem.title}</span>
                <Play className="size-3.5 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => move(queueItem.id, -1)}
                disabled={index === 0}
                aria-label={`Move ${queueItem.title} up`}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => move(queueItem.id, 1)}
                disabled={index === items.length - 1}
                aria-label={`Move ${queueItem.title} down`}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(queueItem.id)}
                aria-label={`Remove ${queueItem.title} from queue`}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
