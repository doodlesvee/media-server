import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchAppearance, saveAppearance } from "./appearanceApi";

/**
 * The homepage's sections, in their default order.
 *
 * `collections` and `tags` are groups rather than single rows — one row is
 * rendered per collection and per tag — so hiding either hides the whole
 * family. Keys are stored, not indexes, so inserting a section later doesn't
 * silently reshuffle somebody's saved order.
 */
export const HOME_ROWS = [
  { key: "categories", label: "Categories" },
  { key: "continue", label: "Continue watching" },
  { key: "favourites", label: "Favourites" },
  { key: "performers", label: "Performers" },
  { key: "studios", label: "Studios" },
  { key: "recent", label: "Recently added" },
  { key: "collections", label: "Collections" },
  { key: "tags", label: "Tags" },
] as const;

export type HomeRowKey = (typeof HOME_ROWS)[number]["key"];

/** An ordered list; anything missing from it is hidden. */
export type HomeRowSetting = { key: HomeRowKey; visible: boolean };

const DEFAULT_HOME_ROWS: HomeRowSetting[] = HOME_ROWS.map((row) => ({
  key: row.key,
  visible: true,
}));

/**
 * Reconciles a stored order against the rows this build actually has.
 *
 * Keeps the saved order and visibility, drops keys that no longer exist, and
 * appends any new section at the end — so shipping a new row doesn't make it
 * invisible to anyone who has ever opened this panel.
 */
function readHomeRows(value: unknown): HomeRowSetting[] {
  if (!Array.isArray(value)) return DEFAULT_HOME_ROWS;

  const known = new Set<string>(HOME_ROWS.map((row) => row.key));
  const seen = new Set<string>();
  const out: HomeRowSetting[] = [];

  for (const entry of value) {
    const key = (entry as HomeRowSetting)?.key;
    if (typeof key !== "string" || !known.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key: key as HomeRowKey,
      visible: (entry as HomeRowSetting).visible !== false,
    });
  }

  for (const row of HOME_ROWS) {
    if (!seen.has(row.key)) out.push({ key: row.key, visible: true });
  }
  return out;
}

/** How much text a tile carries under its artwork. */
export type TileInfo = "full" | "title" | "none";

export const TILE_INFO_OPTIONS: { value: TileInfo; label: string }[] = [
  { value: "full", label: "Full" },
  { value: "title", label: "Title" },
  { value: "none", label: "None" },
];

export type Appearance = {
  /**
   * Tile size as a percentage of the widest a tile goes — one number drives
   * both the rows and the grid.
   *
   * A percentage rather than a pixel width for the same reason as the blur:
   * the number should mean something without knowing the implementation. The
   * rows need an actual length, so it's converted where it's used.
   */
  tileSizePercent: number;
  /**
   * What a tile writes over its artwork.
   *
   * Pairs with the size slider: at 200px the performer line and title crowd
   * the picture, and at 500px they look sparse — so the label has to be able
   * to move too, not just the box.
   */
  tileInfo: TileInfo;
  /** Whether hovering a tile expands it into a preview card. */
  hoverZoom: boolean;
  /** Whether that card plays the video's preview clip, or just holds the still. */
  hoverPreview: boolean;
  /**
   * Whether opening an item starts its preview clip, or opens on the still
   * with nothing running.
   *
   * Separate from `hoverPreview`: a clip under the pointer is glanceable and
   * ends when you move away, but one that starts because you opened something
   * keeps playing until you act. Wanting the first without the second is a
   * reasonable thing to want.
   *
   * Never suppresses deliberate playback — pressing Play, or opening from the
   * hero's Play button, is explicit intent and ignores this.
   */
  modalPreview: boolean;
  /** Blur every image and clip in the app until you hover one. */
  discreet: boolean;
  /**
   * How hard that blur is, as a percentage of the strongest it goes.
   *
   * A percentage rather than a pixel count because pixels mean nothing here —
   * nobody knows what 18px of blur looks like, but "about half" is a thing
   * you can decide. The stylesheet still needs a length, so this is scaled to
   * one at the point it's applied.
   */
  discreetBlurPercent: number;
  /**
   * Whether names are blurred too.
   *
   * Off by default: a blurred picture with "Little Caprice · BlackedRaw"
   * legible underneath hides less than it looks like it does, but blurring
   * the text costs you the ability to find anything, so it's a choice rather
   * than an assumption about which you'd rather have.
   */
  discreetText: boolean;
  /**
   * Height of the homepage hero, as a percentage of the viewport.
   *
   * This and `bannerHeight` were one setting, on the reasoning that they are
   * the same kind of thing and two controls only offer the chance to make
   * them disagree. In practice they are not: the hero is the first thing on
   * the homepage and competes with the rows under it, while a performer
   * header is a title card you scroll past. Wanting a tall hero and a short
   * header is a coherent preference, and one slider could not express it.
   */
  heroHeight: number;
  /**
   * Height of the performer and studio headers, as a percentage of the
   * viewport. See `heroHeight` for why these are separate.
   */
  bannerHeight: number;
  /** Which homepage sections show, and in what order. */
  homeRows: HomeRowSetting[];
};

// The slider's range, in percent of TILE_MAX_PX. Starting at 40% rather than
// 0 because everything below about 200px is too small to read a title in, so
// the lower stretch would just be a dead zone.
export const TILE_MIN = 40;
export const TILE_MAX = 100;
const TILE_MAX_PX = 520;

/** Percent of the widest tile, as the length a layout actually needs. */
export function tileWidthPx(percent: number): number {
  return Math.round((percent / 100) * TILE_MAX_PX);
}

// Percent of the viewport height. Percentages rather than pixels because
// these are full-bleed banners — what matters is how much of the screen they
// take, and that should hold on a laptop and on a large display alike.
// The slider's range, in percent. 100% is BLUR_MAX_PX — past that every tile
// is the same grey smear and you lose all sense of where you are; below about
// 10% shapes are still readable.
export const BLUR_MIN = 10;
export const BLUR_MAX = 100;
const BLUR_MAX_PX = 40;

/** Percent of the strongest blur, as the length CSS actually needs. */
export function blurLength(percent: number): string {
  return `${Math.round((percent / 100) * BLUR_MAX_PX)}px`;
}

export const BANNER_MIN = 30;
export const BANNER_MAX = 100;
export const DEFAULTS: Appearance = {
  // 80% is the 416px it sat at before the slider took percentages.
  tileSizePercent: 80,
  tileInfo: "full",
  hoverZoom: true,
  hoverPreview: true,
  modalPreview: true,
  discreet: false,
  // 45% ≈ the 18px this was fixed at before the slider existed.
  discreetBlurPercent: 45,
  discreetText: false,
  heroHeight: 70,
  bannerHeight: 70,
  homeRows: DEFAULT_HOME_ROWS,
};

const STORAGE_KEY = "appearance";

/**
 * The panic key: Ctrl/Cmd + Shift + H.
 *
 * Chosen because it's reachable one-handed without looking and isn't taken by
 * anything in the app. It only ever turns discreet mode *on* — switching it
 * off is what the privacy password guards, and a key that toggled both ways
 * would undo the protection with the same keystroke that applied it.
 */
export const DISCREET_SHORTCUT = "Ctrl/⌘ + Shift + H";

/**
 * Opens the appearance panel. Comma because every desktop app puts
 * preferences there; with Shift because a bare Ctrl/⌘ + , is the browser's
 * own settings and can't be intercepted.
 */
export const APPEARANCE_SHORTCUT = "Ctrl/⌘ + Shift + ,";

/** Opens search from anywhere. The convention every app with a palette uses. */
export const SEARCH_SHORTCUT = "Ctrl/⌘ + K";

// localStorage throws outright in some privacy configurations, and an
// unguarded read here would white-screen the whole app — the same discipline
// the sidebar's collapsed state already uses.
function clampPercent(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(BANNER_MAX, Math.max(BANNER_MIN, Math.round(value)));
}

function read(): Appearance {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return {
      // A new key, like the blur: the old one held pixels, and a stored 416
      // would clamp to 100% here — a bigger tile than was chosen. Re-validated
      // either way, so a hand-edited entry can't render tiles 4px wide.
      tileSizePercent:
        typeof parsed.tileSizePercent === "number" &&
        Number.isFinite(parsed.tileSizePercent)
          ? Math.min(
              TILE_MAX,
              Math.max(TILE_MIN, Math.round(parsed.tileSizePercent)),
            )
          : DEFAULTS.tileSizePercent,
      tileInfo: TILE_INFO_OPTIONS.some(
        (option) => option.value === parsed.tileInfo,
      )
        ? (parsed.tileInfo as TileInfo)
        : DEFAULTS.tileInfo,
      hoverZoom:
        typeof parsed.hoverZoom === "boolean"
          ? parsed.hoverZoom
          : DEFAULTS.hoverZoom,
      hoverPreview:
        typeof parsed.hoverPreview === "boolean"
          ? parsed.hoverPreview
          : DEFAULTS.hoverPreview,
      modalPreview:
        typeof parsed.modalPreview === "boolean"
          ? parsed.modalPreview
          : DEFAULTS.modalPreview,
      discreet:
        typeof parsed.discreet === "boolean"
          ? parsed.discreet
          : DEFAULTS.discreet,
      // Deliberately a new key: the old one held pixels, and a stored 18
      // would read as 18% here — a much weaker blur than the one that was
      // chosen. Ignoring it falls back to the equivalent default instead.
      discreetBlurPercent:
        typeof parsed.discreetBlurPercent === "number" &&
        Number.isFinite(parsed.discreetBlurPercent)
          ? Math.min(
              BLUR_MAX,
              Math.max(BLUR_MIN, Math.round(parsed.discreetBlurPercent)),
            )
          : DEFAULTS.discreetBlurPercent,
      discreetText:
        typeof parsed.discreetText === "boolean"
          ? parsed.discreetText
          : DEFAULTS.discreetText,
      // Falls back to the old shared value before the default, so a stored
      // banner height carries over to the hero rather than snapping back to
      // 70% the first time someone opens this build.
      heroHeight: clampPercent(
        parsed.heroHeight ?? parsed.bannerHeight,
        DEFAULTS.heroHeight,
      ),
      bannerHeight: clampPercent(parsed.bannerHeight, DEFAULTS.bannerHeight),
      homeRows: readHomeRows(parsed.homeRows),
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Whether anything differs from the defaults — including the settings that
 * live on the Settings page, since Reset in the panel resets all of them.
 * Comparing the whole object means a setting added later is covered without
 * anyone remembering to extend a list of comparisons.
 */
export function isDefaultAppearance(value: Appearance): boolean {
  return JSON.stringify(value) === JSON.stringify(DEFAULTS);
}

type Store = Appearance & {
  set: (patch: Partial<Appearance>) => void;
  reset: () => void;
};

const AppearanceContext = createContext<Store | null>(null);

/**
 * Display preferences that change how every tile in the app is drawn.
 *
 * Two stores, deliberately. The browser's copy is read synchronously so the
 * first paint is already correct — waiting on a request would flash the
 * defaults on every load. The server's copy is the shared one, so a change
 * made in one browser shows up in the next.
 *
 * Writes are debounced: a slider fires on every pixel of a drag, and a PUT
 * per tick would hammer the API to save a preference nobody has finished
 * choosing yet.
 */
export function AppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [value, setValue] = useState<Appearance>(read);
  // Nothing is sent until the server's copy has been read, or the first
  // change would push this browser's local state over what's stored.
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAppearance()
      .then((stored) => {
        if (cancelled) return;
        // Merged over the defaults rather than replacing state: the server
        // holds only what's been changed, so anything absent keeps its
        // default instead of becoming undefined.
        setValue((current) => {
          const merged = { ...current, ...stored };
          // The same migration `read` does, for the server's copy: a install
          // that set a banner height before the hero got its own slider has
          // only the old key, and a browser with no localStorage yet would
          // otherwise show a default-height hero next to the short header.
          if (
            stored.heroHeight === undefined &&
            typeof stored.bannerHeight === "number"
          ) {
            merged.heroHeight = stored.bannerHeight;
          }
          return merged;
        });
      })
      .catch(() => {
        // Offline, or not signed in yet. The local copy is still correct.
      })
      .finally(() => {
        if (!cancelled) loaded.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () => void saveAppearance(value).catch(() => {}),
      500,
    );
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [value]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
      // `code` rather than `key`: with a modifier held some layouts report a
      // different character, and this has to fire every time.
      if (event.code !== "KeyH") return;
      event.preventDefault();
      // The arming half. Pressing the same keys while it's on is handled by
      // DiscreetUnlockDialog, which asks for the password — this handler
      // no-ops in that case rather than the two fighting over one press.
      setValue((current) =>
        current.discreet ? current : { ...current, discreet: true },
      );
    }

    // Capture phase, so it still fires from inside a text field or with a
    // modal open — the moment you need it is not the moment to discover that
    // focus was somewhere unhelpful.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Not being able to remember the choice is survivable; crashing isn't.
    }
  }, [value]);

  // Discreet mode is a single attribute on <html> rather than a prop threaded
  // through every component that renders an image. There are dozens of those —
  // tiles, hero, portraits, banners, album covers, the lightbox — and any one
  // of them missed would be the one showing at the wrong moment.
  useEffect(() => {
    const root = document.documentElement;
    if (value.discreet) {
      root.setAttribute("data-discreet", "true");
      // A custom property rather than a class per strength: the stylesheet
      // reads one variable and the slider can be any value in the range.
      root.style.setProperty(
        "--discreet-blur",
        blurLength(value.discreetBlurPercent),
      );
      if (value.discreetText) root.setAttribute("data-discreet-text", "true");
      else root.removeAttribute("data-discreet-text");
    } else {
      root.removeAttribute("data-discreet");
      root.removeAttribute("data-discreet-text");
      root.style.removeProperty("--discreet-blur");
    }
  }, [value.discreet, value.discreetBlurPercent, value.discreetText]);

  const set = useCallback((patch: Partial<Appearance>) => {
    setValue((current) => ({ ...current, ...patch }));
  }, []);
  const reset = useCallback(() => setValue(DEFAULTS), []);

  const store = useMemo<Store>(
    () => ({ ...value, set, reset }),
    [value, set, reset],
  );

  return (
    <AppearanceContext.Provider value={store}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): Store {
  const store = useContext(AppearanceContext);
  // Falls back to the defaults rather than throwing, so a component rendered
  // outside the provider (a test, a future embed) still draws correctly.
  return store ?? { ...DEFAULTS, set: () => {}, reset: () => {} };
}
