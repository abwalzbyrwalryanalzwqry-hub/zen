import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BackButton } from "@/components/zen/BackButton";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { dirOf, t as tr, useLocale, useT } from "@/lib/i18n";
import { fetchUsageSummary, totalsByEvent } from "@/lib/usage";
import { ServerStorageCard } from "@/components/zen/ServerStorageCard";
import { FeatureFlagsCard } from "@/components/zen/FeatureFlagsCard";

/** لوحة صاحب التطبيق (13.4): مجاميع يومية بلا هوية. الخادم يرفض غير المالك. */
export const Route = createFileRoute("/_authed/owner/usage")({
  head: () => ({ meta: [{ title: `${tr("usage.dashboard")} — Zen` }] }),
  component: OwnerUsage,
});

const PERIODS = [7, 30, 90] as const;

function OwnerUsage() {
  const t = useT();
  const locale = useLocale();
  const [days, setDays] = useState<number>(30);
  const q = useQuery({
    queryKey: ["usage-summary", days],
    queryFn: () => fetchUsageSummary(days),
    retry: false,
  });
  const totals = q.data ? totalsByEvent(q.data.rows) : [];
  const max = Math.max(1, ...totals.map((x) => x.total));
  const byDay = new Map<string, number>();
  for (const r of q.data?.rows ?? []) byDay.set(r.day, (byDay.get(r.day) ?? 0) + Number(r.count));
  const fmt = new Intl.NumberFormat(locale);

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col" dir={dirOf(locale)}>
        <header className="px-4 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <h1 className="flex-1 text-lg font-black">{t("usage.dashboard")}</h1>
        </header>
        <div className="px-4 pb-24 space-y-4">
          {/* الخادم يرفض غير المالك؛ لا تُعرض البطاقتان إن رُفض ملخّص الاستخدام. */}
          {!q.isError && (
            <>
              <ServerStorageCard />
              <FeatureFlagsCard />
            </>
          )}
          <div role="radiogroup" aria-label={t("usage.dashboard")} className="flex gap-2">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={days === p}
                onClick={() => setDays(p)}
                className={`flex-1 min-h-11 rounded-2xl text-xs font-bold ${
                  days === p ? "bg-primary text-primary-foreground" : "bg-secondary/60"
                }`}
              >
                {t("usage.period", { n: p })}
              </button>
            ))}
          </div>

          {q.isError ? (
            <p role="alert" className="glass rounded-3xl p-4 text-sm">
              {t("usage.notOwner")}
            </p>
          ) : q.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {t("usage.consented", {
                  n: fmt.format(q.data?.consented ?? 0),
                  total: fmt.format(q.data?.accounts ?? 0),
                })}
              </p>
              {totals.length === 0 ? (
                <p className="glass rounded-3xl p-4 text-sm">{t("usage.empty")}</p>
              ) : (
                <section aria-label={t("usage.total")} className="glass rounded-3xl p-4 space-y-3">
                  <h2 className="text-sm font-bold">{t("usage.total")}</h2>
                  <ul className="space-y-2">
                    {totals.map((x) => (
                      <li key={x.event} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>{t(`usage.events.${x.event}`)}</span>
                          <span className="font-bold tabular-nums">{fmt.format(x.total)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${(x.total / max) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {byDay.size > 0 && (
                <section aria-label={t("usage.daily")} className="glass rounded-3xl p-4 space-y-2">
                  <h2 className="text-sm font-bold">{t("usage.daily")}</h2>
                  <ul className="text-xs divide-y divide-border">
                    {[...byDay.entries()].map(([d, n]) => (
                      <li key={d} className="flex justify-between py-1.5">
                        <span className="tabular-nums">{d}</span>
                        <span className="font-bold tabular-nums">{fmt.format(n)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
}
