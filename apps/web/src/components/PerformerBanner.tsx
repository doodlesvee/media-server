import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Move, X } from "lucide-react";
import { saveBannerPosition } from "@/lib/performerApi";
import { framingAfterDrag } from "@/lib/reposition";
import { cn } from "@/lib/utils";

/**
 * Banner image with drag-to-reposition.
 *
 * The image is stored uncropped, so which horizontal band is visible is
 * purely a display concern — dragging just moves CSS object-position, and
 * nothing about the file changes. That means the framing stays adjustable
 * indefinitely and re-cropping never degrades the picture.
 *
 * Repositioning is behind an explicit mode rather than always-on: a bare
 * drag handler on a full-width image would swallow ordinary page scrolling,
 * especially on a trackpad or touchscreen.
 */
export function PerformerBanner({
  performerId,
  src,
  positionY,
  canReposition,
  editRequest = 0,
  children,
}: {
  performerId: number;
  src: string | null;
  positionY: number;
  canReposition: boolean;
  /**
   * Bump to open repositioning from outside — the upload control lives in
   * `children`, so it can't reach this component's own editing state.
   * A counter rather than a boolean: two uploads in a row must both open the
   * editor, and a boolean that's already true wouldn't fire again.
   */
  editRequest?: number;
  children?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(positionY);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  // Held in a ref, not state: the pointermove handler needs the latest values
  // without re-subscribing the listener on every frame.
  const drag = useRef<{ startY: number; startPosition: number } | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => setDraft(positionY), [positionY]);
  useEffect(() => {
    if (editRequest > 0) setEditing(true);
  }, [editRequest]);

  const save = useMutation({
    mutationFn: (value: number) => saveBannerPosition(performerId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performer", performerId] });
      setEditing(false);
    },
  });

  useEffect(() => {
    if (!editing) return;

    function onPointerMove(event: PointerEvent) {
      const state = drag.current;
      const container = containerRef.current;
      const image = imageRef.current;
      if (!state || !container || !image || !image.naturalWidth) return;

      // Vertical only, and no zoom: the banner is full-bleed, so a cover fit
      // always overflows downward and never sideways. Passing 0 for the
      // horizontal delta means the shared helper leaves that axis alone.
      const next = framingAfterDrag(
        {
          containerWidth: container.clientWidth,
          containerHeight: container.clientHeight,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          zoom: 1,
        },
        { x: 50, y: state.startPosition },
        0,
        event.clientY - state.startY
      );
      setDraft(next.y);
    }

    function endDrag() {
      drag.current = null;
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [editing]);

  return (
    <div
      ref={containerRef}
      className="relative h-[52vh] min-h-[380px] w-full overflow-hidden"
    >
      {src ? (
        <img
          ref={imageRef}
          src={src}
          alt=""
          draggable={false}
          onPointerDown={(event) => {
            if (!editing) return;
            event.preventDefault();
            drag.current = { startY: event.clientY, startPosition: draft };
          }}
          style={{ objectPosition: `50% ${draft}%` }}
          className={cn(
            "h-full w-full select-none object-cover",
            editing && "cursor-grab active:cursor-grabbing"
          )}
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-secondary to-background" />
      )}

      {/* A thin fade at the very bottom, purely so the banner doesn't cut off
          against the page with a hard line. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />

      {editing && (
        <>
          {/* Guides marking the crop that survives — makes it obvious what
              you're actually choosing while dragging. */}
          <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-white/70" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
            Drag up or down to reframe
          </div>
        </>
      )}

      <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5">
        {canReposition && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1.5 text-xs font-medium text-white ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-black/80"
          >
            <Move className="size-3.5" />
            Reposition
          </button>
        )}

        {editing ? (
          <>
            <button
              type="button"
              onClick={() => save.mutate(Math.round(draft))}
              disabled={save.isPending}
              className="flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-black transition-transform hover:scale-[1.03] disabled:opacity-50"
            >
              <Check className="size-3.5" />
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(positionY);
                setEditing(false);
              }}
              aria-label="Cancel repositioning"
              className="rounded-md bg-black/60 p-1.5 text-white ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-black/80"
            >
              <X className="size-3.5" />
            </button>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
