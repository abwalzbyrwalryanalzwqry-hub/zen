import { createFileRoute } from "@tanstack/react-router";
import { SettingsShell } from "@/components/zen/settings/SettingsShell";
import { AppLockSettings } from "@/components/zen/lock/AppLockSettings";
import { useT, t as tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/_authed/settings_/lock")({
  head: () => ({ meta: [{ title: tStatic("meta.settingsLock") }] }),
  component: LockSettingsPage,
});

/** «الإعدادات ← قفل التطبيق» (1.28.0): رمز PIN أو قفل الجهاز عند فتح زِن. متاح للضيف أيضاً. */
function LockSettingsPage() {
  const t = useT();
  return (
    <SettingsShell title={t("more.links.settingsLock.label")} fallback="/settings">
      <AppLockSettings />
    </SettingsShell>
  );
}
