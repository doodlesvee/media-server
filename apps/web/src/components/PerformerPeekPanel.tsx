import { useQuery } from "@tanstack/react-query";
import { Eye, Heart, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  fetchPerformer,
  performerPortraitUrl,
  portraitStyle,
} from "@/lib/performerApi";
import { PlaySurface } from "./PlaySurface";
import { Portal } from "./Portal";
import type { PerformerSummary } from "./PerformerCard";

export function PerformerPeekPanel({
  performer,
  onClose,
}: {
  performer: PerformerSummary;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["performer", performer.id],
    queryFn: () => fetchPerformer(performer.id),
  });
  const portrait = data
    ? performerPortraitUrl(data)
    : performerPortraitUrl(performer);
  const detail = data;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-label={`Peek ${performer.name}`}
          className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        >
          <div className="relative aspect-[2.4/1] overflow-hidden bg-secondary">
            {portrait ? (
              <img
                src={portrait}
                alt=""
                style={data ? portraitStyle(data) : undefined}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-4xl font-semibold text-muted-foreground">
                {performer.name.trim()[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-black/10" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close performer preview"
              className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/80"
            >
              <X className="size-4" />
            </button>
            <h2 className="sensitive absolute bottom-4 left-5 text-2xl font-bold text-white drop-shadow-md">
              {performer.name}
            </h2>
          </div>

          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{performer.videoCount} videos</span>
              {detail && (
                <>
                  <span>·</span>
                  <span>{detail.watch.watched} watched</span>
                  <span>·</span>
                  <span>{detail.watch.unwatched} unwatched</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  void navigate({
                    to: "/performer/$performerId",
                    params: { performerId: String(performer.id) },
                  })
                }
                className="flex items-center gap-2 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/85"
              >
                <Eye className="size-4" /> Open performer
              </button>
              {performer.isFavorite && (
                <Heart
                  className="size-4 fill-red-500 text-red-500"
                  aria-label="Favourite performer"
                />
              )}
              <PlaySurface
                source={{
                  type: "library",
                  performer: performer.name,
                  tag: null,
                  studio: null,
                  kind: null,
                  q: null,
                  parentId: null,
                }}
                label="Performer playback"
              />
            </div>
          </div>
        </section>
      </div>
    </Portal>
  );
}
