import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Building2 } from "lucide-react";
import { framingStyle, thumbnailUrl } from "@/lib/mediaItemApi";
import { performerPortraitUrl, portraitStyle } from "@/lib/performerApi";
import { cn } from "@/lib/utils";

type PerformerHit = {
  id: number;
  name: string;
  hasImage: boolean;
  hasBanner: boolean;
  representativeItemId: number | null;
  imagePositionX: number;
  imagePositionY: number;
  imageScale: number;
  videoCount: number;
};

type ItemHit = {
  id: number;
  title: string;
  description: string | null;
  thumbnailFile: string | null;
  thumbnailPositionX: number;
  thumbnailPositionY: number;
  thumbnailScale: number;
  releaseDate: string | null;
  performers: { id: number; name: string }[];
};

type Suggestions = {
  performers: PerformerHit[];
  studios: { id: number; name: string }[];
  items: ItemHit[];
};

/** A flattened row, so the keyboard can walk the groups as one list. */
type Row =
  | { kind: "performer"; label: string; performer: PerformerHit }
  | { kind: "studio"; label: string }
  | { kind: "item"; label: string; item: ItemHit }
  | { kind: "query"; label: string };

async function fetchSuggestions(q: string): Promise<Suggestions> {
  const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`Suggestions failed: ${res.status}`);
  return res.json();
}

/** A circular portrait plus the name and how many videos they're in. */
function PerformerRowContent({ performer }: { performer: PerformerHit }) {
  const portrait = performerPortraitUrl(performer);
  return (
    <>
      <span className="size-9 shrink-0 overflow-hidden rounded-full bg-secondary">
        {portrait ? (
          <img
            src={portrait}
            alt=""
            style={portraitStyle(performer)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
            {performer.name.trim()[0]?.toUpperCase() ?? "?"}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{performer.name}</span>
        <span className="block text-[11px] text-muted-foreground">
          {performer.videoCount} {performer.videoCount === 1 ? "video" : "videos"}
        </span>
      </span>
    </>
  );
}

/**
 * A tile, the cast, and the description — capped at two lines so one verbose
 * item can't push the rest of the list off the screen.
 */
function ItemRowContent({ item }: { item: ItemHit }) {
  const cast = item.performers.map((p) => p.name).join(", ");
  const year = item.releaseDate ? item.releaseDate.slice(0, 4) : null;
  return (
    <>
      <span className="w-24 shrink-0 overflow-hidden rounded bg-secondary">
        <img
          src={thumbnailUrl(item)}
          alt=""
          loading="lazy"
          style={framingStyle(item)}
          className="aspect-video w-full object-cover"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.title}</span>
        {(cast || year) && (
          <span className="block truncate text-[11px] text-muted-foreground">
            {[cast, year].filter(Boolean).join(" · ")}
          </span>
        )}
        {item.description && (
          <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground/80">
            {item.description}
          </span>
        )}
      </span>
    </>
  );
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 150;

export function SearchBar({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  // Separate from `value` so every keystroke doesn't fire a request; the
  // input stays instant while the query trails it.
  const [debounced, setDebounced] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setValue(initialValue), [initialValue]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  const { data } = useQuery({
    queryKey: ["search-suggestions", debounced],
    queryFn: () => fetchSuggestions(debounced),
    enabled: debounced.length >= MIN_QUERY_LENGTH,
    // Suggestions for a given prefix don't change as you type past it, and
    // backspacing is common — keeping them briefly makes that feel instant.
    staleTime: 30_000,
  });

  // Close when focus or a click leaves the whole control, not just the input:
  // clicking a suggestion moves focus out of the input first, and blurring on
  // that would unmount the row before its click ever lands.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const rows: Row[] = [
    ...(data?.performers ?? []).map((p) => ({
      kind: "performer" as const,
      label: p.name,
      performer: p,
    })),
    ...(data?.studios ?? []).map((s) => ({ kind: "studio" as const, label: s.name })),
    ...(data?.items ?? []).map((i) => ({ kind: "item" as const, label: i.title, item: i })),
  ];
  // Always offer the plain text search, so a query with no named match still
  // has somewhere to go.
  if (value.trim()) rows.push({ kind: "query", label: value.trim() });

  const showList = open && value.trim().length >= MIN_QUERY_LENGTH && rows.length > 0;

  function choose(row: Row) {
    setOpen(false);
    setActive(-1);
    if (row.kind === "performer") {
      void navigate({ to: "/browse", search: { performer: row.label } });
    } else if (row.kind === "studio") {
      void navigate({ to: "/browse", search: { studio: row.label } });
    } else {
      // An item row searches its title rather than opening the video: the
      // grid is where you can then refine, and opening a modal straight from
      // the header would leave you nowhere to go back to.
      setValue(row.label);
      void navigate({ to: "/browse", search: { q: row.label } });
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!showList) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + rows.length) % rows.length);
    } else if (event.key === "Enter" && active >= 0) {
      // Only intercept Enter when a row is actually highlighted, so plain
      // Enter still submits the typed query.
      event.preventDefault();
      choose(rows[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const GROUP_LABEL: Record<Row["kind"], string> = {
    performer: "Performers",
    studio: "Studios",
    item: "Videos",
    query: "",
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
          void navigate({ to: "/browse", search: { q: value.trim() || undefined } });
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showList}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
          placeholder="Search performers, studios, titles…"
          className="w-full rounded-md border border-border bg-secondary/60 py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring/60 focus:bg-secondary"
        />
      </form>

      {showList && (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute z-50 mt-1 max-h-96 w-full overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-2xl"
        >
          {rows.map((row, index) => {
            const startsGroup = index === 0 || rows[index - 1].kind !== row.kind;
            return (
              <li key={`${row.kind}-${row.label}-${index}`}>
                {startsGroup && GROUP_LABEL[row.kind] && (
                  <span className="block px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    {GROUP_LABEL[row.kind]}
                  </span>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(row)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                    index === active ? "bg-accent text-foreground" : "text-foreground/90"
                  )}
                >
                  {row.kind === "performer" && <PerformerRowContent performer={row.performer} />}
                  {row.kind === "item" && <ItemRowContent item={row.item} />}
                  {row.kind === "studio" && (
                    <>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded bg-secondary">
                        <Building2 className="size-4 text-muted-foreground" />
                      </span>
                      <span className="truncate">{row.label}</span>
                    </>
                  )}
                  {row.kind === "query" && (
                    <>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded bg-secondary">
                        <Search className="size-4 text-muted-foreground" />
                      </span>
                      <span className="truncate">Search for “{row.label}”</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
