import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, MessageSquareWarning } from "lucide-react";
import { SettingsShell } from "@/components/zen/settings/SettingsShell";
import { useT, t as tStatic } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";

export const Route = createFileRoute("/_authed/help")({
  head: () => ({ meta: [{ title: tStatic("meta.help") }] }),
  component: HelpPage,
});

/** الأسئلة المتكررة (تحليل «المزيد» GAP-07): نصوص ثابتة في القاموس تعمل دون اتصال، ثم طريق للإبلاغ. */
const HELP_TOPICS = [
  "offline",
  "recite",
  "guardian",
  "teacher",
  "password",
  "notifications",
  "language",
  "data",
] as const;

function HelpPage() {
  usePagesDict();
  const t = useT();
  return (
    <SettingsShell title={t("help.title")}>
      <p className="px-2 text-xs text-muted-foreground leading-relaxed">{t("help.intro")}</p>
      <ul className="space-y-2">
        {HELP_TOPICS.map((k) => (
          <li key={k}>
            <details className="group glass rounded-3xl">
              <summary className="min-h-14 px-4 py-3 flex items-center gap-3 cursor-pointer list-none rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                <span className="flex-1 text-sm font-bold text-foreground">
                  {t(`help.q.${k}.q`)}
                </span>
                <ChevronDown
                  className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                {t(`help.q.${k}.a`)}
              </p>
            </details>
          </li>
        ))}
      </ul>
      <Link
        to="/feedback"
        search={{ from: "/help" }}
        className="glass-strong rounded-3xl p-4 flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <MessageSquareWarning className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-foreground">{t("help.notFound")}</span>
          <span className="block text-xs text-muted-foreground">{t("help.notFoundHint")}</span>
        </span>
      </Link>
    </SettingsShell>
  );
}
