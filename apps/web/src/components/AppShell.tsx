import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ArrowLeft, List, Search, X } from "lucide-react";
import { SEARCH_SHORTCUT } from "@/lib/appearance";
import { AppearanceMenu } from "./AppearanceMenu";
import { DiscreetUnlockDialog } from "./DiscreetUnlockDialog";
import { SpotlightSearch, openSpotlight } from "./SpotlightSearch";
import { AppFooter } from "./AppFooter";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";
import { cn } from "@/lib/utils";
import { MediaDetailModal } from "./MediaDetailModal";
import { QueuePanel } from "./QueuePanel";
import { useQueue } from "@/lib/queue";
import { NotificationCenter } from "./NotificationCenter";

const SIDEBAR_STORAGE_KEY = "sidebar-collapsed";

// localStorage throws outright in some privacy configurations, so every access
// is guarded — an unhandled throw during the initial render would take down
// the whole app rather than just losing a preference.
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function AppShell({
  children,
  title,
  subtitle,
  centeredHeader = false,
  actions,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  /** For pages whose content is a centred column, so the two agree. */
  centeredHeader?: boolean;
  actions?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { items: queueItems } = useQueue();
  const [queueOpen, setQueueOpen] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [miniPlayer, setMiniPlayer] = useState(false);
  const [resumePlayer, setResumePlayer] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  // Keying the main region on the path re-runs its entry animation on every
  // navigation, so pages fade in rather than snapping into place.
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      // Preference just won't persist — not worth surfacing.
    }
  }, [collapsed]);

  useEffect(() => {
    function resumeItem(event: Event) {
      const detail = (
        event as CustomEvent<number | { id: number; resume?: boolean }>
      ).detail;
      const id = typeof detail === "number" ? detail : detail?.id;
      if (typeof id !== "number") return;
      setPlayingId(id);
      setMiniPlayer(true);
      setResumePlayer(typeof detail !== "number" && detail.resume === true);
    }
    window.addEventListener("media-server:play-item", resumeItem);
    return () =>
      window.removeEventListener("media-server:play-item", resumeItem);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && focusMode) {
        event.preventDefault();
        setFocusMode(false);
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey)
        return;
      if (event.code !== "KeyF") return;
      event.preventDefault();
      setFocusMode((active) => !active);
    }
    function onToggle() {
      setFocusMode((active) => !active);
    }
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("media-server:toggle-focus", onToggle);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("media-server:toggle-focus", onToggle);
    };
  }, [focusMode]);

  return (
    <div
      className={cn(
        "flex min-h-screen bg-background text-foreground",
        focusMode && "focus-mode",
      )}
    >
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        queueCount={queueItems.length}
        queueOpen={queueOpen}
        onQueueToggle={() => setQueueOpen((open) => !open)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The search field used to hold the centre column; with search on
            ⌘K there's nothing to centre, so the header is just its actions. */}
        <header className="cinema-hide focus-hide sticky top-0 z-30 flex items-center justify-end gap-4 border-b border-border bg-background/85 px-6 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            {actions}
            <NotificationCenter />
            <button
              type="button"
              onClick={openSpotlight}
              aria-label="Search"
              title={`Search (${SEARCH_SHORTCUT})`}
              className="flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground"
            >
              <Search className="size-4" />
            </button>
            <UserMenu />
          </div>
        </header>

        {focusMode && (
          <div className="animate-toolbar-in sticky top-0 z-30 flex items-center gap-2 border-b border-border/70 bg-background/90 px-4 py-2 backdrop-blur-md">
            <button
              type="button"
              onClick={() => window.history.back()}
              aria-label="Go back"
              title="Go back"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="min-w-0 flex-1 px-2">
              <p className="truncate text-sm font-medium">
                {title ?? "Library"}
              </p>
              {subtitle && (
                <p className="truncate text-[11px] text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={openSpotlight}
              aria-label="Search"
              title={`Search (${SEARCH_SHORTCUT})`}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Search className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setQueueOpen((open) => !open)}
              aria-label="Open playback queue"
              aria-expanded={queueOpen}
              title="Playback queue"
              className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <List className="size-4" />
              {queueItems.length > 0 && (
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {queueItems.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setFocusMode(false)}
              aria-label="Exit Focus Mode"
              title="Exit Focus Mode (Esc)"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {(title || subtitle) && (
          // Centred only where the page beneath it is centred too — a heading
          // on a different axis to its own content reads as a mistake.
          <div className={cn("px-6 pt-6", centeredHeader && "text-center")}>
            {title && (
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        )}

        <main key={pathname} className="min-w-0 flex-1 animate-fade-in">
          {children}
        </main>

        <div className="cinema-hide focus-hide">
          <AppFooter />
        </div>
      </div>

      {queueOpen && (
        <div className="fixed bottom-16 left-2 z-40 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-lg bg-card shadow-2xl ring-1 ring-border">
          <QueuePanel
            onPlay={(id) => {
              setPlayingId(id);
              setMiniPlayer(true);
              setResumePlayer(false);
              setQueueOpen(false);
            }}
          />
        </div>
      )}

      {playingId !== null && (
        <MediaDetailModal
          itemId={playingId}
          autoPlay={miniPlayer}
          resume={resumePlayer}
          mini={miniPlayer}
          onExpand={() => setMiniPlayer(false)}
          onClose={() => {
            setPlayingId(null);
            setMiniPlayer(false);
            setResumePlayer(false);
          }}
        />
      )}

      {/* Rendered here rather than in the header: it has no trigger any more,
          and it portals itself, so it only needs to exist somewhere that's on
          every page. */}
      <AppearanceMenu />
      <DiscreetUnlockDialog />
      <SpotlightSearch />
    </div>
  );
}
