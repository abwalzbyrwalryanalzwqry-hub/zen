import { createFileRoute } from "@tanstack/react-router";
import { SettingsShell } from "@/components/zen/settings/SettingsShell";
import { LICENSES } from "@/lib/licenses";
import { useT, t as tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/_authed/about_/licenses")({
  head: () => ({ meta: [{ title: tStatic("meta.licenses") }] }),
  component: LicensesPage,
});

/** تراخيص المكتبات مفتوحة المصدر المشحونة داخل التطبيق (GAP-08). ثابتة داخل الحزمة وتعمل دون اتصال. */
function LicensesPage() {
  const t = useT();
  return (
    <SettingsShell title={t("aboutApp.licenses.title")} fallback="/about">
      <p className="px-2 text-xs text-muted-foreground leading-relaxed">
        {t("aboutApp.licenses.intro")}
      </p>
      <ul className="glass rounded-3xl divide-y divide-border/60 overflow-hidden">
        {LICENSES.map((l) => (
          <li key={l.name}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-14 flex items-center gap-3 px-4 py-3 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <span className="flex-1 min-w-0 text-sm font-bold text-foreground" dir="ltr">
                {l.name}
              </span>
              <span className="text-xs text-muted-foreground font-mono" dir="ltr">
                {l.license}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </SettingsShell>
  );
}
