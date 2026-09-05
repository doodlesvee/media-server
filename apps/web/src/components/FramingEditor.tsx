import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { framingAfterDrag, framingTravel, type Framing } from "@/lib/reposition";
import { cn } from "@/lib/utils";

export type FramingValue = Framing & { scale: number };

/**
 * Drag-and-zoom to choose which part of an image is shown.
 *
 * Nothing here is specific to what's being framed — a category cover and a
 * video's thumbnail are the same problem, and forking this for the second one
 * would mean maintaining the travel maths twice. The caller supplies the
 * image, the current value, the aspect ratio to preview at, and what to do on
 * save.
 *
 * `aspectClass` matters: the preview must match the frame the image will
 * actually be cropped to, or you'd choose a band here that gets cropped
 * differently in the real thing.
 */
export function FramingEditor({
  src,
  value,
  aspectClass,
  saving,
  onSave,
  onCancel,
  note,
}: {
  src: string;
  value: FramingValue;
  aspectClass: string;
  saving?: boolean;
  onSave: (next: FramingValue) => void;
  onCancel: () => void;
  note?: string;
}) {
  const [draft, setDraft] = useState<Framing>({ x: value.x, y: value.y });
  const [scale, setScale] = useState(value.scale);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  // A ref, not state: the pointermove handler needs the latest values without
  // re-subscribing the listener on every frame.
  const drag = useRef<{ startX: number; startY: number; start: Framing } | null>(null);
  // Which axes actually have hidden image, recomputed whenever the zoom or
  // the loaded image changes — saying so beats a dead drag.
  const [travel, setTravel] = useState<Framing>({ x: 0, y: 0 });
  // The listener is subscribed once, so it can't close over `scale` — a ref
  // keeps it reading the current zoom without re-subscribing on every tick.
  const scaleRef = useRef(value.scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const state = drag.current;
      const container = containerRef.current;
      const image = imageRef.current;
      if (!state || !container || !image) return;

      setDraft(
        framingAfterDrag(
          {
            containerWidth: container.clientWidth,
            containerHeight: container.clientHeight,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            zoom: scaleRef.current / 100,
          },
          state.start,
          event.clientX - state.startX,
          event.clientY - state.startY
        )
      );
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
  }, []);

  // Zoom changes what's pannable, so this can't be a load-time check alone.
  useEffect(() => {
    measure();
  }, [scale]);

  function measure() {
    const container = containerRef.current;
    const image = imageRef.current;
    if (!container || !image || !image.naturalWidth) return;
    setTravel(
      framingTravel({
        containerWidth: container.clientWidth,
        containerHeight: container.clientHeight,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        zoom: scale / 100,
      })
    );
  }

  const canPanX = travel.x > 1;
  const canPanY = travel.y > 1;
  const draggable = canPanX || canPanY;
  // Naming the axes matters: a 16:9 poster in a 16:9 frame has nothing hidden
  // in any direction, and a bare "drag to reframe" would read as broken.
  // Saying that zooming unlocks it explains the dead drag instead.
  const hint = !draggable
    ? "This image already fits — zoom in to reframe it"
    : canPanX && canPanY
      ? "Drag any direction to reframe"
      : canPanY
        ? "Drag up or down — zoom in to pan sideways too"
        : "Drag left or right — zoom in to pan vertically too";

  const dirty = Math.round(draft.x) !== value.x || Math.round(draft.y) !== value.y || scale !== value.scale;

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={cn(
          "relative w-full max-w-sm overflow-hidden rounded-md ring-1 ring-border",
          aspectClass
        )}
      >
        <img
          ref={imageRef}
          src={src}
          alt=""
          draggable={false}
          onLoad={measure}
          onPointerDown={(event) => {
            if (!draggable) return;
            event.preventDefault();
            drag.current = { startX: event.clientX, startY: event.clientY, start: draft };
          }}
          style={{
            objectPosition: `${draft.x}% ${draft.y}%`,
            transform: `scale(${scale / 100})`,
            // Anchoring the zoom to the same percentages is what lets one pair
            // of numbers drive both the crop and the zoom pan: origin at the
            // left keeps the left edge pinned as it grows, revealing the same
            // side object-position is already showing.
            transformOrigin: `${draft.x}% ${draft.y}%`,
          }}
          className={cn(
            "h-full w-full select-none object-cover",
            draggable && "cursor-grab active:cursor-grabbing"
          )}
        />
        <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-white/60" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70 px-3 py-1.5 text-center text-xs text-white backdrop-blur-sm">
          {hint}
        </div>
      </div>

      <label className="flex max-w-sm items-center gap-3 text-xs text-muted-foreground">
        <span className="shrink-0">Zoom</span>
        <input
          type="range"
          min={100}
          max={300}
          step={5}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer accent-white"
        />
        <span className="w-10 shrink-0 text-right tabular-nums">{scale}%</span>
      </label>

      {note && <p className="max-w-sm text-[11px] text-muted-foreground/70">{note}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSave({ x: Math.round(draft.x), y: Math.round(draft.y), scale })}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-black transition-transform hover:scale-[1.03] disabled:opacity-50"
        >
          <Check className="size-3.5" />
          Save framing
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
          Cancel
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setDraft({ x: value.x, y: value.y });
              setScale(value.scale);
            }}
            className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
