import { getRouteApi, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AppearanceSettingsSection } from "@/components/AppearanceSettingsSection";
import { BackupSettingsSection } from "@/components/BackupSettingsSection";
import { CategorySettings } from "@/components/CategorySettings";
import { HeroSettingsSection } from "@/components/HeroSettingsSection";
import { LibraryCleanupSection } from "@/components/LibraryCleanupSection";
import { LibrarySettingsSection } from "@/components/LibrarySettingsSection";
import { LibraryHealthSection } from "@/components/LibraryHealthSection";
import { DuplicatesSection } from "@/components/DuplicatesSection";
import { CacheSettingsSection } from "@/components/CacheSettingsSection";
import { NetworkSettingsSection } from "@/components/NetworkSettingsSection";
import { PrivacySettingsSection } from "@/components/PrivacySettingsSection";
import { ActivityLogSection } from "@/components/ActivityLogSection";
import { cn } from "@/lib/utils";

const routeApi = getRouteApi("/settings");

/**
 * Grouped rather than one tab per section: four tabs of two things beats six
 * tabs of one, and the pairs genuinely belong together — where files come
 * from and how they're categorised, then the two things that decide what the
 * homepage shows.
 */
const TABS = [
  { id: "library", label: "Library" },
  { id: "homepage", label: "Homepage" },
  { id: "privacy", label: "Privacy" },
  { id: "backup", label: "Backup" },
  { id: "activity", label: "Activity" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettingsPage() {
  const { tab } = routeApi.useSearch();
  // An unknown tab in the URL falls back rather than rendering an empty page.
  const active: TabId = TABS.some((t) => t.id === tab)
    ? (tab as TabId)
    : "library";

  return (
    <AppShell
      title="Site settings"
      subtitle="How this server looks and behaves."
      centeredHeader
    >
      {/* A settings column centred in the page rather than pinned to the
          left edge: the sections are a fixed, readable width, and on a wide
          screen that left everything hugging one side with a screen of empty
          space beside it. */}
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-6">
        <nav
          // Scrolls on a phone rather than pushing the whole page sideways:
          // the tabs are wider than a 390px viewport, and centring them meant
          // the first and last were both cut off with no way to reach them.
          className="scrollbar-hide -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 md:mx-0 md:justify-center md:overflow-visible md:px-0"
        >
          {TABS.map((entry) => (
            <Link
              key={entry.id}
              to="/settings"
              search={{ tab: entry.id }}
              className={cn(
                // The underline sits on the nav's own border, so switching
                // tabs doesn't shift the content below by a pixel.
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                active === entry.id
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
            </Link>
          ))}
        </nav>

        {/* Keyed on the tab so each panel mounts fresh — a half-typed password
            or an open editor doesn't survive a switch to somewhere unrelated
            and back. */}
        <div key={active} className="stagger space-y-5 py-6">
          {active === "library" && (
            <>
              <LibraryHealthSection />
              <DuplicatesSection />
              <LibraryCleanupSection />
              <LibrarySettingsSection />
              <CategorySettings />
            </>
          )}
          {active === "homepage" && (
            <>
              <HeroSettingsSection />
              <AppearanceSettingsSection />
            </>
          )}
          {active === "privacy" && (
            <>
              <PrivacySettingsSection />
              <NetworkSettingsSection />
            </>
          )}
          {active === "backup" && (
            <>
              <BackupSettingsSection />
              <CacheSettingsSection />
            </>
          )}
          {active === "activity" && <ActivityLogSection />}
        </div>
      </div>
    </AppShell>
  );
}
