import { createFileRoute } from "@tanstack/react-router";
import { BellRing, Download, LockKeyhole, Moon, Palette, type LucideIcon } from "lucide-react";
import { SettingsShell } from "@/components/zen/settings/SettingsShell";
import { SettingsSection } from "@/components/zen/more/SettingsSection";
import { ListRow } from "@/components/zen/more/ListRow";
import { useSession } from "@/hooks/useSession";
import { useT, t as tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/_authed/settings")({
  head: () => ({ meta: [{ title: tStatic("meta.settings") }] }),
  component: SettingsHub,
});

/**
 * فهرس الإعدادات (تحليل «المزيد» §7.4): `/settings` كانت صفحة واحدة لكل شيء؛ صارت فهرساً لثلاث صفحات،
 * ويبقى المسار نفسه فلا تنكسر الروابط القديمة (إشعارات «فعّل التنبيهات» مثلاً).
 */
const ENTRIES: { key: string; to: string; icon: LucideIcon; guest: boolean }[] = [
  { key: "settingsDisplay", to: "/settings/display", icon: Palette, guest: true },
  { key: "settingsNotifications", to: "/settings/notifications", icon: BellRing, guest: false },
  { key: "settingsPrayer", to: "/settings/prayer", icon: Moon, guest: true },
  { key: "settingsLock", to: "/settings/lock", icon: LockKeyhole, guest: true },
  { key: "storage", to: "/storage", icon: Download, guest: true },
];

function SettingsHub() {
  const t = useT();
  const { guest } = useSession();
  return (
    <SettingsShell title={t("settings.title")}>
      <SettingsSection id="settings" title={t("settings.hubHint")}>
        {ENTRIES.filter((e) => !guest || e.guest).map((e) => (
          <ListRow
            key={e.key}
            to={e.to}
            icon={e.icon}
            label={t(`more.links.${e.key}.label`)}
            hint={t(`more.links.${e.key}.hint`)}
          />
        ))}
      </SettingsSection>
    </SettingsShell>
  );
}
