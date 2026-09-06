import { describe, expect, it } from "vitest";
import { framingAfterDrag, framingTravel, type FrameMetrics } from "./reposition.js";

// A 16:9 image inside a wide 2.18:1 tile: cover scales it to the tile's width,
// so it overflows vertically and fits exactly horizontally.
const wideFrame: FrameMetrics = {
  containerWidth: 384,
  containerHeight: 176,
  naturalWidth: 1920,
  naturalHeight: 1080,
  zoom: 1,
};

describe("framingTravel", () => {
  it("reports vertical travel and no horizontal travel at zoom 1", () => {
    const travel = framingTravel(wideFrame);
    expect(travel.x).toBe(0);
    // 1080/1920 * 384 = 216 rendered height, less the 176 frame.
    expect(travel.y).toBeCloseTo(40, 5);
  });

  it("unlocks horizontal travel once zoomed in", () => {
    const travel = framingTravel({ ...wideFrame, zoom: 1.5 });
    expect(travel.x).toBeGreaterThan(0);
    expect(travel.y).toBeGreaterThan(40);
  });

  it("magnifies the cover overflow by the zoom, but not the zoom overflow", () => {
    // cover overflow (40) * 2 + (2 - 1) * 176 = 256. Getting this wrong is
    // what makes a drag drift away from the cursor.
    expect(framingTravel({ ...wideFrame, zoom: 2 }).y).toBeCloseTo(256, 5);
  });

  it("returns no travel when the image exactly fits", () => {
    const travel = framingTravel({
      containerWidth: 160,
      containerHeight: 90,
      naturalWidth: 1920,
      naturalHeight: 1080,
      zoom: 1,
    });
    expect(travel.x).toBeCloseTo(0, 5);
    expect(travel.y).toBeCloseTo(0, 5);
  });

  it("returns zero rather than NaN before the image has loaded", () => {
    expect(framingTravel({ ...wideFrame, naturalWidth: 0, naturalHeight: 0 })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("treats a zero or negative zoom as no zoom", () => {
    expect(framingTravel({ ...wideFrame, zoom: 0 })).toEqual(framingTravel(wideFrame));
  });
});

describe("framingAfterDrag", () => {
  const start = { x: 50, y: 50 };

  it("moves the framing opposite to the drag, so the image follows the cursor", () => {
    // Dragging down reveals what is above, so the percentage decreases.
    expect(framingAfterDrag(wideFrame, start, 0, 20).y).toBeLessThan(50);
    expect(framingAfterDrag(wideFrame, start, 0, -20).y).toBeGreaterThan(50);
  });

  it("tracks one-to-one: a drag of the full travel spans the full range", () => {
    // 40px of travel is 100% of the range, so 20px is 50 percentage points.
    expect(framingAfterDrag(wideFrame, start, 0, 20).y).toBeCloseTo(0, 5);
  });

  it("leaves an axis with no travel untouched rather than clamping it", () => {
    // Clamping a dead axis would silently reset a framing already chosen.
    expect(framingAfterDrag(wideFrame, { x: 33, y: 50 }, 100, 0).x).toBe(33);
  });

  it("clamps to 0-100 at the extremes", () => {
    expect(framingAfterDrag(wideFrame, start, 0, 9999).y).toBe(0);
    expect(framingAfterDrag(wideFrame, start, 0, -9999).y).toBe(100);
  });

  it("moves less per pixel when zoomed in", () => {
    const plain = framingAfterDrag(wideFrame, start, 0, 10).y;
    const zoomed = framingAfterDrag({ ...wideFrame, zoom: 2 }, start, 0, 10).y;
    // Same gesture, smaller change — because the magnified image travels
    // further on screen for the same movement of the source.
    expect(50 - zoomed).toBeLessThan(50 - plain);
  });

  it("moves both axes at once when both have travel", () => {
    const next = framingAfterDrag({ ...wideFrame, zoom: 2 }, start, 20, 20);
    expect(next.x).not.toBe(50);
    expect(next.y).not.toBe(50);
  });
});
