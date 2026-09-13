import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLastSession,
  describeHref,
  isOfferable,
  readLastSession,
  writeLastSession,
} from "./lastSession";

beforeEach(() => localStorage.clear());

describe("lastSession storage", () => {
  it("round-trips a location", () => {
    writeLastSession({ href: "/browse?tags=indoor", label: "indoor" });
    expect(readLastSession()?.href).toBe("/browse?tags=indoor");
  });

  it("returns null rather than throwing on corrupt storage", () => {
    localStorage.setItem("last-session", "{not json");
    expect(readLastSession()).toBeNull();
  });

  it("rejects a stored value of the wrong shape", () => {
    localStorage.setItem("last-session", JSON.stringify({ nope: 1 }));
    expect(readLastSession()).toBeNull();
  });

  it("clears", () => {
    writeLastSession({ href: "/browse", label: "the library" });
    clearLastSession();
    expect(readLastSession()).toBeNull();
  });
});

describe("isOfferable", () => {
  const session = (over: Partial<{ href: string; at: string }> = {}) => ({
    href: "/browse?tags=indoor",
    label: "indoor",
    at: new Date().toISOString(),
    ...over,
  });

  it("offers a recent, non-home location", () => {
    expect(isOfferable(session())).toBe(true);
  });

  // Pointing at something from three weeks ago is an old bookmark presented
  // as continuity, not continuity.
  it("declines anything older than a day", () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(isOfferable(session({ at: old }))).toBe(false);
  });

  // The prompt lives on the home page, so offering to return there is a
  // button that does nothing.
  it("declines the home page", () => {
    expect(isOfferable(session({ href: "/" }))).toBe(false);
  });

  it("declines nothing stored, and an unparseable timestamp", () => {
    expect(isOfferable(null)).toBe(false);
    expect(isOfferable(session({ at: "whenever" }))).toBe(false);
  });
});

describe("describeHref", () => {
  it("names the filter that defines the view", () => {
    expect(describeHref("/browse?q=beach")).toBe("your search for “beach”");
    expect(describeHref("/browse?watched=false")).toBe("your unwatched items");
    expect(describeHref("/browse?favorite=true")).toBe("your favourites");
    expect(describeHref("/browse?tags=indoor,night")).toBe(
      "items tagged indoor",
    );
    expect(describeHref("/browse?studio=Acme")).toBe("Acme");
    expect(describeHref("/performers")).toBe("Performers");
  });

  it("falls back to the library rather than an empty label", () => {
    expect(describeHref("/browse")).toBe("the library");
  });

  // The search wins over a filter that happens to be alongside it: it is
  // what you typed, so it is what you will recognise.
  it("leads with the search when a view has both", () => {
    expect(describeHref("/browse?tags=indoor&q=beach")).toBe(
      "your search for “beach”",
    );
  });
});
