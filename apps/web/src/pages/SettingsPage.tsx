import { AppShell } from "@/components/AppShell";
import { HeroSettingsSection } from "@/components/HeroSettingsSection";

export function SettingsPage() {
  return (
    <AppShell title="Site settings" subtitle="How this server looks and behaves.">
      <div className="space-y-5 px-6 py-8">
        <HeroSettingsSection />
      </div>
    </AppShell>
  );
}
