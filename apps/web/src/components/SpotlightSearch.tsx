import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Portal } from "./Portal";
import {
  GROUP_LABEL,
  ItemRowContent,
  PerformerRowContent,
  rowTarget,
  useSuggestionRows,
  type Row,
} from "./searchRows";

/**
 * Search from anywhere, Spotlight-style.
 *
 * The header field already does live suggestions, but it's a small box at the
 * top of the page you have to aim at. This is the same search with the
 * keyboard as the way in and the results given room — the two share their
 * fetching and row rendering, so a match looks the same in both.
 */
/**
 * Opens the palette from elsewhere — the header button.
 *
 * An event rather than lifted state: this component is mounted once in the
 * shell and the button lives in the header, so sharing a boolean would mean a
 * context provider wrapping the whole app to carry it.
 */
const OPEN_EVENT = "media-server:open-search";

export function openSpotlight(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function SpotlightSearch() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const listRef = useRef<HTMLUListElement>(null);

  const { rows, ready } = useSuggestionRows(value);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      if (event.code !== "KeyK") return;
      // Chrome puts its address bar on this too; preventDefault is what stops
      // the omnibox opening over the top of us.
      event.preventDefault();
      setOpen((o) => !o);
    }
    function onOpen() {
      setOpen(true);
    }

    // Capture, so the shortcut fires from inside a text field too.
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // A fresh query each time it opens: reopening to find something else and
  // being handed the last search is worse than an empty box.
  useEffect(() => {
    if (!open) {
      setValue("");
      setActive(0);
    }
  }, [open]);

  // The highlight is an index into a list that changes as you type, so it has
  // to go back to the top whenever the results do.
  useEffect(() => setActive(0), [rows.length]);

  // Keeps the highlighted row on screen when arrowing past the fold.
  useEffect(() => {
    const node = listRef.current?.children[active];
    node?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(row: Row) {
    setOpen(false);
    void navigate({ to: "/browse", search: rowTarget(row) });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      // Stopped here so closing this doesn't also close a video behind it.
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      // Falls back to the plain query when nothing is highlighted yet, so
      // typing and hitting Enter always does something.
      const row = rows[active];
      if (row) choose(row);
      else if (value.trim()) void navigate({ to: "/browse", search: { q: value.trim() } });
    }
  }

  if (!open) return null;

  return (
    <Portal>
      <div
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        // Sits above the page but below the discreet-mode prompt: that one is
        // the only way out of a mode, and nothing should cover it.
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-[2px]"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        >
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-5 shrink-0 text-muted-foreground" />
            <input
              value={value}
              autoFocus
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search performers, studios, titles…"
              className="w-full bg-transparent py-4 text-base outline-none placeholder:text-muted-foreground"
            />
            <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Esc
            </kbd>
          </div>

          {ready && (
            <ul ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
              {rows.map((row, index) => (
                <li key={`${row.kind}-${row.label}-${index}`}>
                  <button
                    type="button"
                    onClick={() => choose(row)}
                    // Highlight follows the pointer as well as the keyboard,
                    // so the two never disagree about what Enter would open.
                    onMouseMove={() => setActive(index)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      active === index ? "bg-accent" : "hover:bg-accent/50"
                    )}
                  >
                    {row.kind === "performer" && <PerformerRowContent performer={row.performer} />}
                    {row.kind === "item" && <ItemRowContent item={row.item} />}
                    {row.kind === "studio" && (
                      <span className="min-w-0 flex-1 truncate font-medium">{row.label}</span>
                    )}
                    {row.kind === "query" && (
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        Search for “{row.label}”
                      </span>
                    )}
                    {row.kind !== "query" && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/60">
                        {GROUP_LABEL[row.kind]}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Portal>
  );
}
