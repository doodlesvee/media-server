import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { SEARCH_SHORTCUT } from "@/lib/appearance";
import { AppearanceMenu } from "./AppearanceMenu";
import { DiscreetUnlockDialog } from "./DiscreetUnlockDialog";
import { SpotlightSearch, openSpotlight } from "./SpotlightSearch";
import { AppFooter } from "./AppFooter";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";
import { cn } from "@/lib/utils";

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
  // Keying the main region on the path re-runs its entry animation on every
  // navigation, so pages fade in rather than snapping into place.
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      // Preference just won't persist — not worth surfacing.
    }
  }, [collapsed]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The search field used to hold the centre column; with search on
            ⌘K there's nothing to centre, so the header is just its actions. */}
        <header className="sticky top-0 z-30 flex items-center justify-end gap-4 border-b border-border bg-background/85 px-6 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            {actions}
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

        {(title || subtitle) && (
          // Centred only where the page beneath it is centred too — a heading
          // on a different axis to its own content reads as a mistake.
          <div className={cn("px-6 pt-6", centeredHeader && "text-center")}>
            {title && <h1 className="text-2xl font-bold tracking-tight">{title}</h1>}
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        )}

        <main key={pathname} className="min-w-0 flex-1 animate-fade-in">
          {children}
        </main>

        <AppFooter />
      </div>

      {/* Rendered here rather than in the header: it has no trigger any more,
          and it portals itself, so it only needs to exist somewhere that's on
          every page. */}
      <AppearanceMenu />
      <DiscreetUnlockDialog />
      <SpotlightSearch />

    </div>
  );
}
