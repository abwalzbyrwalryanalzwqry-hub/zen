import { createFileRoute } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import { SettingRow, SettingsShell } from "@/components/zen/settings/SettingsShell";
import { SettingsSection } from "@/components/zen/more/SettingsSection";
import { Switch } from "@/components/zen/more/Switch";
import { DisplaySettings } from "@/components/zen/AccountSettings";
import { CrashReportSettings } from "@/components/zen/CrashReportSettings";
import { UsageConsent } from "@/components/zen/UsageConsent";
import { PerfModeSettings } from "@/components/zen/settings/PerfModeSettings";
import { SimpleModeSettings } from "@/components/zen/settings/SimpleModeSettings";
import { useTheme } from "@/hooks/use-theme";
import { useSession } from "@/hooks/useSession";
import { useT, t as tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/_authed/settings_/display")({
  head: () => ({ meta: [{ title: tStatic("meta.settingsDisplay") }] }),
  component: DisplaySettingsPage,
});

/**
 * التفضيلات (تحليل «المزيد» IA-01): «كيف يبدو التطبيق؟» في صفحة واحدة: اللغة، والسمة، والخط والتباين،
 * وموافقات التشخيص. كانت موزّعة بين «الحساب» و«التنبيهات والمواقيت».
 */
function DisplaySettingsPage() {
  const t = useT();
  const { theme, toggle } = useTheme();
  const { guest } = useSession();
  const dark = theme === "dark";
  return (
    <SettingsShell title={t("more.links.settingsDisplay.label")} fallback="/more">
      <SettingsSection id="appearance" variant="card" title={t("settings.display.appearance")}>
        <div className="flex items-center gap-3">
          {dark ? (
            <Sun className="w-4 h-4 text-gold shrink-0" aria-hidden="true" />
          ) : (
            <Moon className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          )}
          <div className="flex-1 min-w-0">
            <SettingRow
              id="zen-theme"
              label={t("settings.display.theme")}
              hint={t("settings.display.themeHint")}
              control={<Switch labelledBy="zen-theme" on={dark} onChange={() => toggle()} />}
            />
          </div>
        </div>
      </SettingsSection>
      <DisplaySettings />
      <PerfModeSettings />
      {!guest && <SimpleModeSettings />}
      <CrashReportSettings />
      {!guest && <UsageConsent />}
    </SettingsShell>
  );
}
