/**
 * Where the expanded hover card goes, and how big it is allowed to be.
 *
 * Extracted from the component because it is arithmetic against the viewport
 * and the bug it fixes is invisible until a tile happens to be large: the
 * width was scaled without being clamped, so only the *position* was kept on
 * screen and a near-full-width tile grew straight off the right-hand edge.
 */

export const EXPANDED_SCALE = 1.85;
export const VIEWPORT_MARGIN = 8;

/**
 * Below this share of the window, growing a tile shows you meaningfully more
 * of it. At or above, the expanded card would be clamped back to roughly the
 * size the tile already is, so all the hover would do is make the picture
 * jump.
 */
const WORTH_EXPANDING_SHARE = 0.6;

export function worthExpanding(
  anchorWidth: number,
  viewportWidth: number,
): boolean {
  return anchorWidth < viewportWidth * WORTH_EXPANDING_SHARE;
}

export type HoverCardBox = { left: number; top: number; width: number };

export function hoverCardBox(
  anchor: { left: number; top: number; width: number },
  viewport: { width: number; height: number },
): HoverCardBox {
  // Never wider than the window. This is the clamp that was missing.
  const width = Math.max(
    0,
    Math.min(
      anchor.width * EXPANDED_SCALE,
      viewport.width - VIEWPORT_MARGIN * 2,
    ),
  );

  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(
      anchor.left + anchor.width / 2 - width / 2,
      viewport.width - width - VIEWPORT_MARGIN,
    ),
  );

  // Centred on the thumbnail it grew from, then bounded top *and* bottom: a
  // card anchored low used to hang below the fold with its controls out of
  // reach.
  const thumbGrowth = (width - anchor.width) * (9 / 16);
  const maxTop = Math.max(
    VIEWPORT_MARGIN,
    viewport.height - (width * 9) / 16 - VIEWPORT_MARGIN,
  );
  const top = Math.min(
    maxTop,
    Math.max(VIEWPORT_MARGIN, anchor.top - thumbGrowth / 2),
  );

  return { left, top, width };
}
