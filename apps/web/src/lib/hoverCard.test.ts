import { describe, expect, it } from "vitest";
import {
  EXPANDED_SCALE,
  VIEWPORT_MARGIN,
  hoverCardBox,
  worthExpanding,
} from "./hoverCard";

const VIEW = { width: 1400, height: 900 };

describe("hoverCardBox", () => {
  it("grows a small tile by the full scale", () => {
    const box = hoverCardBox({ left: 500, top: 300, width: 200 }, VIEW);
    expect(box.width).toBe(200 * EXPANDED_SCALE);
  });

  // The reported bug: a near-full-width tile expanded off the screen.
  it("never grows wider than the window", () => {
    const box = hoverCardBox({ left: 0, top: 100, width: 1400 }, VIEW);
    expect(box.width).toBeLessThanOrEqual(VIEW.width - VIEWPORT_MARGIN * 2);
    expect(box.left + box.width).toBeLessThanOrEqual(VIEW.width);
  });

  it("keeps the card on screen from either edge", () => {
    for (const left of [0, 1200, 1399]) {
      const box = hoverCardBox({ left, top: 300, width: 320 }, VIEW);
      expect(box.left).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
      expect(box.left + box.width).toBeLessThanOrEqual(VIEW.width);
    }
  });

  it("keeps a card anchored low from hanging below the fold", () => {
    const box = hoverCardBox({ left: 400, top: 880, width: 320 }, VIEW);
    const height = (box.width * 9) / 16;
    expect(box.top + height).toBeLessThanOrEqual(VIEW.height);
    expect(box.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
  });

  it("stays on screen in a window smaller than one tile", () => {
    const tiny = { width: 320, height: 240 };
    const box = hoverCardBox({ left: 0, top: 0, width: 900 }, tiny);
    expect(box.width).toBeLessThanOrEqual(tiny.width);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
  });
});

describe("worthExpanding", () => {
  it("expands an ordinary grid tile", () => {
    expect(worthExpanding(300, 1400)).toBe(true);
  });

  it("refuses a tile that already fills the window", () => {
    expect(worthExpanding(1400, 1400)).toBe(false);
    expect(worthExpanding(900, 1400)).toBe(false);
  });
});
