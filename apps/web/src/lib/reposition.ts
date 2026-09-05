/**
 * Shared maths for drag-to-reframe on an `object-cover` image.
 *
 * The file is never cropped — framing only moves CSS `object-position` and
 * `transform`, so it stays adjustable forever and costs no image quality.
 *
 * Used by both the performer banner and the category tile covers, so the
 * fiddly part — working out how far the image can actually travel — has a
 * single implementation.
 */

export type Framing = { x: number; y: number };

export type FrameMetrics = {
  /** The visible frame. */
  containerWidth: number;
  containerHeight: number;
  /** The image's intrinsic size, needed to know how much it overflows. */
  naturalWidth: number;
  naturalHeight: number;
  /** Zoom on top of the cover fit, as a multiplier (1 = none). */
  zoom: number;
};

/**
 * How far the image can travel in each axis, in on-screen pixels.
 *
 * There are two separate sources of hidden image, and they don't combine the
 * way you'd first guess:
 *
 *  - **The cover fit.** `object-fit: cover` scales the source until it covers
 *    the frame, so exactly one axis overflows — whichever the source is
 *    "longer" in relative to the frame. That overflow is what
 *    `object-position` pans through. Crucially it's *inside* the element, so
 *    a later `scale(z)` magnifies it: one source pixel of pan shows up as z
 *    pixels of movement.
 *  - **The zoom.** Scaling a frame-sized box by z hides `(z - 1) x size` of
 *    it, panned by moving the transform origin. That figure is already in
 *    screen pixels, so it isn't multiplied again.
 *
 * At zoom 1 only one axis can move, which is why dragging sideways does
 * nothing until you zoom in on a normal landscape cover — there is genuinely
 * nothing hidden to the left or right.
 */
export function framingTravel(metrics: FrameMetrics): Framing {
  const { containerWidth, containerHeight, naturalWidth, naturalHeight } = metrics;
  if (!naturalWidth || !naturalHeight || !containerWidth || !containerHeight) {
    return { x: 0, y: 0 };
  }

  const zoom = metrics.zoom > 0 ? metrics.zoom : 1;
  const coverScale = Math.max(containerWidth / naturalWidth, containerHeight / naturalHeight);
  const coverOverflowX = Math.max(0, naturalWidth * coverScale - containerWidth);
  const coverOverflowY = Math.max(0, naturalHeight * coverScale - containerHeight);

  return {
    x: coverOverflowX * zoom + (zoom - 1) * containerWidth,
    y: coverOverflowY * zoom + (zoom - 1) * containerHeight,
  };
}

/**
 * The new framing percentages for a drag.
 *
 * Dividing by the real travel is what makes the image track the cursor
 * one-to-one rather than drifting at some arbitrary sensitivity that feels
 * different on every image and every zoom level. An axis with no travel is
 * left untouched rather than clamped, so a dead axis can't quietly reset a
 * framing you already chose.
 */
export function framingAfterDrag(
  metrics: FrameMetrics,
  start: Framing,
  deltaX: number,
  deltaY: number
): Framing {
  const travel = framingTravel(metrics);
  // Dragging down or right should reveal what's above or to the left, hence
  // the subtraction.
  return {
    x: travel.x > 0 ? clamp(start.x - (deltaX / travel.x) * 100) : start.x,
    y: travel.y > 0 ? clamp(start.y - (deltaY / travel.y) * 100) : start.y,
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
