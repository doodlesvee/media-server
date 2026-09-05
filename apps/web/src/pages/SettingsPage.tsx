import { AppShell } from "@/components/AppShell";
import { BackupSettingsSection } from "@/components/BackupSettingsSection";
import { CategorySettings } from "@/components/CategorySettings";
import { HeroSettingsSection } from "@/components/HeroSettingsSection";
import { LibrarySettingsSection } from "@/components/LibrarySettingsSection";

export function SettingsPage() {
  return (
    <AppShell title="Site settings" subtitle="How this server looks and behaves.">
      <div className="stagger space-y-5 px-6 py-8">
        <LibrarySettingsSection />
        <HeroSettingsSection />
        <CategorySettings />
        <BackupSettingsSection />
      </div>
    </AppShell>
  );
}
