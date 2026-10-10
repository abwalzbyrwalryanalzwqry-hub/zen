import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { SettingsShell } from "@/components/zen/settings/SettingsShell";
import { useT, t as tStatic } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";
import { APP_VERSION } from "@/lib/app-version";
import { markReleaseSeen, releaseKey, visibleReleases } from "@/lib/whats-new";

export const Route = createFileRoute("/_authed/about_/whats-new")({
  head: () => ({ meta: [{ title: tStatic("meta.whatsNew") }] }),
  component: WhatsNewPage,
});

/** «ما الجديد» (GAP-04): ملاحظات كل إصدار بلغة المستخدم، والأحدث أولاً. فتحها يُخفي نقطة «جديد». */
function WhatsNewPage() {
  usePagesDict();
  const t = useT();
  const releases = visibleReleases();
  useEffect(() => markReleaseSeen(), []);
  return (
    <SettingsShell title={t("whatsNew.title")} fallback="/more">
      {releases.map((r, i) => (
        <section
          key={r.version}
          aria-labelledby={`release-${r.version}`}
          className={`${i === 0 ? "glass-strong" : "glass"} rounded-3xl p-4 space-y-3`}
        >
          <h2
            id={`release-${r.version}`}
            className="text-sm font-black text-foreground flex items-center gap-2"
          >
            {i === 0 && <Sparkles className="w-4 h-4 text-gold" aria-hidden="true" />}
            {t("whatsNew.version")}{" "}
            <bdi dir="ltr" className="font-mono">
              {r.version}
            </bdi>
            {r.version === APP_VERSION && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                {t("whatsNew.installed")}
              </span>
            )}
          </h2>
          <ul className="space-y-2 list-disc ps-5">
            {r.items.map((item) => (
              <li key={item} className="text-sm text-foreground leading-relaxed">
                {t(`whatsNew.${releaseKey(r.version)}.${item}`)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </SettingsShell>
  );
}
