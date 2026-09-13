/**
 * Where you were when you last closed the app (§3's "Last Session").
 *
 * Only the location — the route and its search string. Everything that makes
 * a view what it is already lives there: filters, sort, the folder, the
 * period. Scroll position is deliberately not stored here, because the
 * router already restores it per-href and a second copy would be a second
 * thing to keep in agreement.
 *
 * Offered rather than applied. §3 suggests "Welcome back → Continue where
 * you left off", and the difference matters: silently reopening a filtered
 * view means the app disagrees with the Home link you just clicked, and the
 * first thing you do is work out how to get back to the library.
 *
 * localStorage rather than sessionStorage — the point is the session *after*
 * this one — and never the item you had open, which would be a record of
 * what you were watching sitting in browser storage for the next person to
 * open the app.
 */

const STORAGE_KEY = "last-session";

export type LastSession = {
  /** Pathname plus search, as a single href the router can navigate to. */
  href: string;
  /** Something short enough to put on a button. */
  label: string;
  at: string;
};

export function readLastSession(): LastSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastSession;
    if (typeof parsed?.href !== "string" || typeof parsed?.label !== "string")
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLastSession(session: {
  href: string;
  label: string;
}): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...session, at: new Date().toISOString() }),
    );
  } catch {
    // Optional when browser storage is unavailable.
  }
}

export function clearLastSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // As above.
  }
}

/**
 * Whether a session is recent enough to be worth offering.
 *
 * "Continue where you left off" pointing at something from three weeks ago
 * is not continuity, it is an old bookmark presented as one. A day is the
 * span over which "where I was" still means anything.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isOfferable(session: LastSession | null): session is LastSession {
  if (!session) return false;
  // The home page is where the prompt appears, so offering to return to it
  // would be a button that does nothing.
  if (session.href === "/" || session.href === "") return false;
  const at = Date.parse(session.at);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < MAX_AGE_MS;
}

/**
 * A human name for a browse URL, from the filters it carries.
 *
 * Derived rather than stored so the label cannot go stale against the href
 * it describes — the two are written together, but only one of them is the
 * truth.
 */
export function describeHref(href: string): string {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);

  // The trailing slash is load-bearing: "/performers" starts with
  // "/performer", so a bare prefix test would describe the index page as one
  // performer. Detail routes all carry an id after the slash; index routes
  // never do.
  if (path.startsWith("/performer/")) return "a performer";
  if (path.startsWith("/studio/")) return "a studio";
  if (path.startsWith("/album/")) return "an album";
  if (path.startsWith("/series/")) return "a series";
  if (path === "/performers") return "Performers";
  if (path === "/studios") return "Studios";
  if (path === "/albums") return "Albums";
  if (path === "/series") return "Series";

  const q = params.get("q");
  if (q) return `your search for “${q}”`;
  if (params.get("collectionId")) return "a collection";
  const tags = params.get("tags") ?? params.get("tag");
  if (tags) return `items tagged ${tags.split(",")[0]}`;
  const performer = params.get("performers") ?? params.get("performer");
  if (performer) return performer.split(",")[0];
  if (params.get("studio")) return params.get("studio") as string;
  if (params.get("watched") === "false") return "your unwatched items";
  if (params.get("favorite") === "true") return "your favourites";
  if (params.get("year")) return `${params.get("year")}`;
  if (params.get("parentId")) return "a folder";
  return "the library";
}
