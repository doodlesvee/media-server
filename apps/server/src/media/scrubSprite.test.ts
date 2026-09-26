import { describe, expect, it } from "vitest";
import { spriteLayout } from "./scrubSprite.js";

describe("spriteLayout", () => {
  it("takes about one frame per ten seconds", () => {
    expect(spriteLayout(300)).toEqual({ count: 30, interval: 10 });
  });

  it("never drops below ten frames on a short clip", () => {
    const { count, interval } = spriteLayout(20);
    expect(count).toBe(10);
    expect(interval).toBe(2);
  });

  it("caps a long video at a hundred frames, spread over its whole length", () => {
    const { count, interval } = spriteLayout(3 * 60 * 60);
    expect(count).toBe(100);
    expect(count * interval).toBe(3 * 60 * 60);
  });
});
