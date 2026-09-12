import { describe, expect, it } from "vitest";
import { activePreset, cardLayout, PRESETS, VIEW_MODES } from "./layout";
import { columnsForWidth } from "./gridLayout";
import { tileWidthPx } from "./appearance";

describe("cardLayout", () => {
  it("scales the chosen tile width by the mode, leaving the slider meaningful", () => {
    expect(cardLayout(400, "grid", "comfortable", "full").widthPx).toBe(400);
    expect(cardLayout(400, "compact", "comfortable", "full").widthPx).toBe(320);
    expect(cardLayout(400, "large", "comfortable", "full").widthPx).toBe(480);
  });

  it("gives a whole number of pixels, which the column maths needs", () => {
    expect(Number.isInteger(cardLayout(333, "compact", "dense", "full").widthPx)).toBe(true);
  });

  it("never collapses a card to nothing", () => {
    expect(cardLayout(0, "compact", "dense", "none").widthPx).toBeGreaterThan(0);
  });

  it("tightens every gap as density increases", () => {
    const spacious = cardLayout(400, "grid", "spacious", "full");
    const dense = cardLayout(400, "grid", "dense", "full");
    expect(dense.columnGapPx).toBeLessThan(spacious.columnGapPx);
    expect(dense.rowGapPx).toBeLessThan(spacious.rowGapPx);
    expect(dense.paddingPx).toBeLessThan(spacious.paddingPx);
  });

  it("leaves room under a row for the text a column gap never clears", () => {
    for (const density of ["spacious", "comfortable", "compact", "dense"] as const) {
      const layout = cardLayout(400, "grid", density, "full");
      expect(layout.rowGapPx).toBeGreaterThan(layout.columnGapPx);
    }
  });

  // Cover art is 16:10 and stays that way. A wide 21:9 mode used to exist and
  // cropped the sides off the artwork, which is the one thing a library of
  // artwork should not do to itself.
  it("keeps every mode on the same frame, so nothing crops the artwork", () => {
    for (const { value } of VIEW_MODES) {
      expect(cardLayout(400, value, "comfortable", "full").aspectRatio).toBe("16 / 10");
    }
  });

  it("reports the shape as a ratio the grid can estimate row heights with", () => {
    expect(cardLayout(400, "grid", "comfortable", "full").heightRatio).toBeCloseTo(10 / 16);
    // A NaN here would collapse the scrollbar.
    for (const { value } of VIEW_MODES) {
      const { heightRatio } = cardLayout(400, value, "comfortable", "full");
      expect(Number.isFinite(heightRatio)).toBe(true);
      expect(heightRatio).toBeGreaterThan(0);
    }
  });

  it("falls back rather than returning undefined for an unknown mode", () => {
    // A value hand-edited into stored settings must not break the grid.
    const layout = cardLayout(400, "nonsense" as never, "nonsense" as never, "full");
    expect(layout.widthPx).toBe(400);
    expect(layout.aspectRatio).toBe("16 / 10");
    expect(layout.columnGapPx).toBeGreaterThan(0);
  });
});

describe("the presets as actually rendered", () => {
  // The failure this guards against is not a crash: it is four presets that
  // all look the same. The grid fits columns and then stretches them, so two
  // presets whose widths land on the same column count are indistinguishable
  // however different their numbers look here.
  const COMMON_WIDTHS = [1100, 1400, 1800];

  function columnsFor(preset: (typeof PRESETS)[number], width: number) {
    const layout = cardLayout(
      tileWidthPx(preset.settings.tileSizePercent),
      preset.settings.viewMode,
      preset.settings.density,
      preset.settings.tileInfo,
    );
    return columnsForWidth(width, layout.widthPx, layout.columnGapPx);
  }

  const byName = (width: number) =>
    Object.fromEntries(PRESETS.map((p) => [p.value, columnsFor(p, width)]));

  it("fits steadily fewer, larger cards from Detailed up to Minimal", () => {
    for (const width of COMMON_WIDTHS) {
      const cols = byName(width);
      expect(cols.detailed, `at ${width}px`).toBeGreaterThan(cols.comfortable);
      expect(cols.comfortable, `at ${width}px`).toBeGreaterThan(cols.minimal);
    }
  });

  // A tile at or past 60% of the window has nothing to expand into and the
  // hover preview refuses to open. No preset should land there on an ordinary
  // desktop — the widest one used to, which is how that was noticed.
  it("never sizes a preset past the point where hovering stops working", () => {
    for (const preset of PRESETS) {
      expect(columnsFor(preset, 1800), `${preset.label} at 1800px`).toBeGreaterThan(1);
    }
  });

  it("labels everything on Detailed and nothing on Minimal", () => {
    const info = Object.fromEntries(
      PRESETS.map((p) => [p.value, cardLayout(400, p.settings.viewMode, p.settings.density, p.settings.tileInfo).tileInfo]),
    );
    expect(info.detailed).toBe("full");
    expect(info.minimal).toBe("none");
  });
});

describe("activePreset", () => {
  it("recognises each preset from its settings alone", () => {
    for (const preset of PRESETS) {
      expect(activePreset(preset.settings)).toBe(preset.value);
    }
  });

  it("reports Custom once a single setting is changed behind a preset", () => {
    const comfortable = PRESETS.find((p) => p.value === "comfortable")!;
    expect(activePreset({ ...comfortable.settings, density: "dense" })).toBeNull();
  });

  // The slider is part of a preset now, so nudging it has to drop to Custom
  // rather than leaving a preset highlighted that no longer describes the view.
  it("reports Custom when only the size slider is moved", () => {
    const comfortable = PRESETS.find((p) => p.value === "comfortable")!;
    expect(
      activePreset({ ...comfortable.settings, tileSizePercent: comfortable.settings.tileSizePercent + 5 }),
    ).toBeNull();
  });

  it("gives every preset its own slider position", () => {
    const sizes = PRESETS.map((p) => p.settings.tileSizePercent);
    expect(new Set(sizes).size).toBe(PRESETS.length);
  });

  it("gives every preset a distinct combination", () => {
    const seen = new Set(PRESETS.map((p) => JSON.stringify(p.settings)));
    expect(seen.size).toBe(PRESETS.length);
  });
});
