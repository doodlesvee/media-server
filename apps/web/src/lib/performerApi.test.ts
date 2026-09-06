import { describe, expect, it } from "vitest";
import { performerImageUrl, performerPortraitUrl, portraitStyle } from "./performerApi.js";

const base = { id: 3, hasImage: false, hasBanner: false, representativeItemId: null };

describe("performerPortraitUrl", () => {
  it("prefers an uploaded photo", () => {
    expect(performerPortraitUrl({ ...base, hasImage: true })).toBe(
      "/api/performers/3/image?kind=avatar"
    );
  });

  it("falls back to a frame from one of their videos", () => {
    expect(performerPortraitUrl({ ...base, representativeItemId: 42 })).toBe(
      "/api/media-items/42/thumbnail"
    );
  });

  it("returns null when there is nothing to show", () => {
    // The caller renders an initial instead of a broken image.
    expect(performerPortraitUrl(base)).toBeNull();
  });
});

describe("performerImageUrl", () => {
  it("returns null for a kind that was never uploaded", () => {
    expect(performerImageUrl(base, "banner")).toBeNull();
    expect(performerImageUrl({ ...base, hasBanner: true }, "banner")).toContain("kind=banner");
  });
});

describe("portraitStyle", () => {
  it("defaults to top-aligned, where faces usually are", () => {
    expect(portraitStyle({}).objectPosition).toBe("50% 0%");
  });

  it("omits the transform entirely at zoom 100", () => {
    expect(portraitStyle({}).transform).toBeUndefined();
  });

  it("emits a scale once zoomed", () => {
    expect(portraitStyle({ imageScale: 150 }).transform).toBe("scale(1.5)");
  });

  it("anchors the zoom to the chosen position", () => {
    const style = portraitStyle({ imagePositionX: 20, imagePositionY: 80, imageScale: 120 });
    expect(style.objectPosition).toBe("20% 80%");
    expect(style.transformOrigin).toBe("20% 80%");
  });
});
