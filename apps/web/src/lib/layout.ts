/**
 * How a view mode and a density turn into actual lengths.
 *
 * Three axes on purpose, kept orthogonal so no two controls fight over the
 * same pixel: tile size is the base width you choose, the view mode decides
 * the card's shape and how much of that width it wants, and density decides
 * how much air sits between cards. Bundling them into one "size" control was
 * the alternative, and it makes every preset a compromise.
 */

export type ViewMode = "grid" | "compact" | "large";

export const VIEW_MODES: { value: ViewMode; label: string; hint: string }[] = [
  { value: "grid", label: "Grid", hint: "The standard tile." },
  { value: "compact", label: "Compact", hint: "Smaller tiles, more per row." },
  { value: "large", label: "Large", hint: "Bigger tiles, same detail." },
];

export type Density = "spacious" | "comfortable" | "compact" | "dense";

export const DENSITIES: { value: Density; label: string }[] = [
  { value: "spacious", label: "Spacious" },
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
  { value: "dense", label: "Dense" },
];

/** What a tile writes over its artwork. Mirrors the existing setting. */
export type TileInfo = "full" | "title" | "none";

/**
 * Multiplies the chosen tile width. The mode says how big a card wants to be
 * relative to your baseline, rather than replacing the baseline — so moving
 * the size slider still does what it says in every mode.
 *
 * Spread wide on purpose. The grid fits columns with `auto-fill` and then
 * stretches them with `1fr`, so a multiplier only shows up when it changes
 * the column *count* — two modes a few percent apart land on the same count
 * at most widths and render identically. Two modes a few percent apart were
 * indistinguishable at every ordinary viewport.
 */
const MODE_WIDTH_SCALE: Record<ViewMode, number> = {
  grid: 1,
  compact: 0.8,
  large: 1.2,
};

/**
 * Density's own contribution to width.
 *
 * The spec asks density to affect column count, and gaps alone barely do:
 * shrinking a 16px gap to 6px rarely buys a whole extra column. This is what
 * makes a density change visible rather than theoretical.
 */
const DENSITY_WIDTH_SCALE: Record<Density, number> = {
  spacious: 1.12,
  comfortable: 1,
  compact: 0.92,
  dense: 0.85,
};

/**
 * The shape of every card's frame.
 *
 * One value rather than a table per mode: the modes differ by how much room a
 * card takes, not by how the artwork is cropped. A wide 21:9 mode used to
 * live here and was dropped — it cut the sides off cover art, which is the
 * one thing a library of artwork should not do to itself.
 *
 * Kept as width and height rather than a CSS string so the virtualized grid
 * can estimate a row's height from it, instead of parsing the string back out
 * and producing NaN the first time the format changes.
 */
const CARD_ASPECT = { w: 16, h: 10 };

/**
 * Gaps in pixels, per density: [between columns, under a row].
 *
 * Rows get more than columns at every level because a row's gap also has to
 * clear the text under the card, which a column gap never does.
 */
const DENSITY_GAPS: Record<Density, { column: number; row: number }> = {
  spacious: { column: 28, row: 40 },
  comfortable: { column: 16, row: 24 },
  compact: { column: 10, row: 16 },
  dense: { column: 6, row: 10 },
};

/** Padding and text spacing inside a card, in pixels. */
const DENSITY_PADDING: Record<Density, number> = {
  spacious: 14,
  comfortable: 10,
  compact: 7,
  dense: 4,
};

/**
 * The parts of a card's look that do not depend on how wide the grid made it.
 *
 * Split out because a card is rendered in rows and pickers too, where nothing
 * has computed a column width. Since the wide mode was dropped these no
 * longer vary by view mode at all — the mode only decides how much width a
 * card asks for, which is the grid's business, not the card's.
 */
export type CardChrome = {
  /** A CSS `aspect-ratio` value for the artwork frame. */
  aspectRatio: string;
  /** The same shape as a multiplier, for working out a row's height. */
  heightRatio: number;
  paddingPx: number;
  tileInfo: TileInfo;
};

export function cardChrome(density: Density, tileInfo: TileInfo): CardChrome {
  return {
    aspectRatio: `${CARD_ASPECT.w} / ${CARD_ASPECT.h}`,
    heightRatio: CARD_ASPECT.h / CARD_ASPECT.w,
    paddingPx: DENSITY_PADDING[density] ?? DENSITY_PADDING.comfortable,
    // No mode overrides the label setting any more, so it passes straight
    // through. The one that did was the wide mode, and it is gone.
    tileInfo,
  };
}

export type CardLayout = CardChrome & {
  /** Minimum column width the grid should fit against. */
  widthPx: number;
  columnGapPx: number;
  rowGapPx: number;
};

export function cardLayout(
  tileWidthPx: number,
  mode: ViewMode,
  density: Density,
  tileInfo: TileInfo,
): CardLayout {
  const gaps = DENSITY_GAPS[density] ?? DENSITY_GAPS.comfortable;
  return {
    ...cardChrome(density, tileInfo),
    // Rounded because it becomes a CSS pixel length and a grid column count;
    // a fractional minimum makes the column maths drift by a column at some
    // widths and not others.
    widthPx: Math.max(
      1,
      Math.round(
        tileWidthPx *
          (MODE_WIDTH_SCALE[mode] ?? 1) *
          (DENSITY_WIDTH_SCALE[density] ?? 1),
      ),
    ),
    columnGapPx: gaps.column,
    rowGapPx: gaps.row,
  };
}

/**
 * The named bundles. "Custom" is not listed: it is what the panel reports
 * when the current settings match none of these, rather than something you
 * can pick.
 */
export type PresetName = "minimal" | "comfortable" | "detailed";

export type PresetSettings = {
  viewMode: ViewMode;
  density: Density;
  tileInfo: TileInfo;
  /**
   * The size slider's position.
   *
   * Presets set it because they change how big cards actually are, and a
   * slider that stayed put while the tiles visibly resized was telling you
   * something untrue about your own settings. It also carries most of the
   * difference between presets — the mode multipliers are deliberately mild,
   * so the number you can see is the one doing the work.
   */
  tileSizePercent: number;
};

export const PRESETS: {
  value: PresetName;
  label: string;
  hint: string;
  settings: PresetSettings;
}[] = [
  {
    value: "minimal",
    label: "Minimal",
    hint: "Large imagery, no text over it.",
    settings: {
      viewMode: "large",
      density: "spacious",
      tileInfo: "none",
      tileSizePercent: 74,
    },
  },
  {
    value: "comfortable",
    label: "Comfortable",
    hint: "Balanced spacing and detail.",
    settings: {
      viewMode: "grid",
      density: "comfortable",
      tileInfo: "full",
      tileSizePercent: 58,
    },
  },
  {
    value: "detailed",
    label: "Detailed",
    hint: "More on screen, everything labelled.",
    settings: {
      viewMode: "compact",
      density: "dense",
      tileInfo: "full",
      tileSizePercent: 42,
    },
  },
];

/**
 * Which preset the current settings are, or null for "Custom".
 *
 * Derived rather than stored: a stored preset name goes stale the moment a
 * single setting is changed behind it, and then the panel claims a preset the
 * view no longer matches.
 */
export function activePreset(settings: PresetSettings): PresetName | null {
  const match = PRESETS.find(
    (preset) =>
      preset.settings.viewMode === settings.viewMode &&
      preset.settings.density === settings.density &&
      preset.settings.tileInfo === settings.tileInfo &&
      preset.settings.tileSizePercent === settings.tileSizePercent,
  );
  return match?.value ?? null;
}
