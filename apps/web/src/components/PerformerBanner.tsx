import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, X } from "lucide-react";
import { saveBannerPosition } from "@/lib/performerApi";
import { useAppearance } from "@/lib/appearance";
import { framingAfterDrag } from "@/lib/reposition";

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
  editRequest = 0,
  children,
}: {
  performerId: number;
  src: string | null;
  positionY: number;
  /**
   * Bump to open repositioning from outside — the upload control lives in
   * `children`, so it can't reach this component's own editing state.
   * A counter rather than a boolean: two uploads in a row must both open the
   * editor, and a boolean that's already true wouldn't fire again.
   */
  editRequest?: number;
  children?: React.ReactNode;
}) {
  const { bannerHeight } = useAppearance();
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
      style={{ height: `${bannerHeight}vh` }}
      className="group relative w-full overflow-hidden"
    >
      {src ? (
        editing ? (
          <img
            ref={imageRef}
            src={src}
            draggable={false}
            onPointerDown={(event) => {
              event.preventDefault();
              drag.current = { startY: event.clientY, startPosition: draft };
            }}
            style={{ objectPosition: `50% ${draft}%` }}
            className="h-full w-full select-none object-cover cursor-grab active:cursor-grabbing"
          />
        ) : (
          <div
            aria-hidden="true"
            // `discreet-background` because this paints its picture through
            // background-image; the blur rule cannot see it as an image
            // otherwise. The editing branch above is a real <img> and is
            // already covered.
            className="performer-banner-fixed discreet-background absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundAttachment: "fixed",
              backgroundImage: `url("${src}")`,
              backgroundPosition: `50% ${draft}%`,
            }}
          />
        )
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
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit banner"
            title="Edit banner"
            className="flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 ring-1 ring-white/20 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <Pencil className="size-3.5" />
            Edit
          </button>
        )}

        {editing ? (
          <>
            {children}
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
        ) : null}
      </div>
    </div>
  );
}
