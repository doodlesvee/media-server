import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { AppFooter } from "./AppFooter";
import { RescanButton } from "./RescanButton";
import { Sidebar } from "./Sidebar";

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

function SearchBar({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  const navigate = useNavigate();

  useEffect(() => setValue(initialValue), [initialValue]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void navigate({ to: "/browse", search: { q: value.trim() || undefined } });
      }}
      className="relative w-full max-w-sm"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search titles and descriptions…"
        className="w-full rounded-md border border-border bg-secondary/60 py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring/60 focus:bg-secondary"
      />
    </form>
  );
}

export function AppShell({
  children,
  searchValue,
  title,
  subtitle,
  actions,
}: {
  children: React.ReactNode;
  searchValue?: string;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);

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
        <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-border bg-background/85 px-6 py-3 backdrop-blur-md">
          <SearchBar initialValue={searchValue} />
          <div className="ml-auto flex items-center gap-3">
            {actions}
            <RescanButton />
          </div>
        </header>

        {(title || subtitle) && (
          <div className="px-6 pt-6">
            {title && <h1 className="text-2xl font-bold tracking-tight">{title}</h1>}
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        )}

        <main className="min-w-0 flex-1">{children}</main>

        <AppFooter />
      </div>
    </div>
  );
}
