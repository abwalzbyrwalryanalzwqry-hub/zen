import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Activity, AlertTriangle, Loader2 } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { fetchAppHealth, hourlyBuckets, type AppHealth } from "@/lib/app-health";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { QueryError } from "@/components/zen/QueryError";
import { intlLocale, plural, useLocale, useT, t as tStatic } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";

export const Route = createFileRoute("/_authed/app-health")({
  head: () => ({ meta: [{ title: tStatic("meta.appHealth") }] }),
  component: AppHealthScreen,
});

const fmtIn = (locale: string) => (iso: string) =>
  new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });

/** «صحة التطبيق» لصاحب التطبيق (المرحلة 7.7): أخطاء العملاء وتنبيهات الساعة. */
function AppHealthScreen() {
  usePagesDict();
  const [days, setDays] = useState(7);
  const t = useT();
  const fmt = fmtIn(intlLocale(useLocale()));
  const q = useQuery({
    queryKey: ["app-health", days],
    queryFn: () => fetchAppHealth(days),
    placeholderData: keepPreviousData,
  });
  // undefined = جارٍ التحميل، null = لا صلاحية/لا بيانات.
  const data: AppHealth | null | undefined = q.isPending ? undefined : (q.data ?? null);
  const error = q.isError && !q.data;

  const buckets = data ? hourlyBuckets(data.hourly) : [];
  const peak = Math.max(1, ...buckets.map((b) => b.errors));
  // ملخّص نصي للرسم (تحليل «المزيد» A11Y-05): قارئ الشاشة لا يرى أعمدة div.
  const worst = buckets.reduce<(typeof buckets)[number] | null>(
    (m, b) => (b.errors > (m?.errors ?? 0) ? b : m),
    null,
  );
  const chartSummary = worst
    ? t("appHealth.chartSummary", {
        total: buckets.reduce((s, b) => s + b.errors, 0),
        hour: `${worst.hour.getHours()}:00`,
        peak: worst.errors,
      })
    : t("appHealth.chartEmpty");

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-4 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <h1 className="text-xl font-black flex-1">{t("appHealth.title")}</h1>
          <Activity className="w-5 h-5 text-primary" aria-hidden="true" />
        </header>
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
          {error ? (
            <div className="pt-6">
              <QueryError onRetry={() => void q.refetch()} />
            </div>
          ) : data === undefined ? (
            <div
              className="flex justify-center py-10"
              role="status"
              aria-label={t("common.loading")}
            >
              <Loader2 className="w-6 h-6 animate-spin text-primary" aria-hidden="true" />
            </div>
          ) : data === null ? (
            <p className="text-sm text-muted-foreground text-center pt-10">
              {t("appHealth.ownerOnly")}
            </p>
          ) : (
            <>
              <div className="flex gap-2" role="group" aria-label={t("appHealth.period")}>
                {[1, 7, 30].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    aria-pressed={days === d}
                    className={`flex-1 rounded-full min-h-11 py-2 text-xs font-bold ${days === d ? "bg-primary text-primary-foreground" : "glass text-muted-foreground"}`}
                  >
                    {plural("units.days", d)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label={t("appHealth.last24h")} value={data.errors24h} />
                <Stat
                  label={t("appHealth.inPeriod", { period: plural("units.days", data.days) })}
                  value={data.errorsPeriod}
                />
                <Stat label={t("appHealth.usersAffected")} value={data.usersPeriod} />
              </div>
              <section className="glass rounded-3xl p-4" aria-labelledby="app-health-hourly">
                <h2 id="app-health-hourly" className="text-xs font-bold text-muted-foreground mb-3">
                  {t("appHealth.hourly")}
                </h2>
                <div
                  className="flex items-end gap-0.5 h-24"
                  dir="ltr"
                  role="img"
                  aria-label={chartSummary}
                >
                  {buckets.map((b) => (
                    <div
                      key={b.hour.getTime()}
                      title={`${b.hour.getHours()}:00 — ${b.errors}`}
                      className={`flex-1 rounded-t ${b.errors ? "bg-destructive/70" : "bg-muted"}`}
                      style={{ height: `${Math.max(4, (b.errors / peak) * 100)}%` }}
                    />
                  ))}
                </div>
              </section>
              {data.alerts.length > 0 && (
                <section
                  className="glass rounded-3xl p-4 space-y-2"
                  aria-labelledby="app-health-alerts"
                >
                  <h2 id="app-health-alerts" className="text-xs font-bold text-muted-foreground">
                    {t("appHealth.alerts")}
                  </h2>
                  {data.alerts.map((a) => (
                    <p key={a.hour} className="text-xs flex items-center gap-2">
                      <AlertTriangle
                        className="w-3.5 h-3.5 text-destructive shrink-0"
                        aria-hidden="true"
                      />
                      {t("appHealth.alertRow", {
                        time: fmt(a.hour),
                        errors: a.errors,
                        threshold: a.threshold,
                      })}
                    </p>
                  ))}
                </section>
              )}
              <section className="space-y-2" aria-labelledby="app-health-top">
                <h2 id="app-health-top" className="text-xs font-bold text-muted-foreground px-1">
                  {t("appHealth.top")}
                </h2>
                {data.top.length === 0 ? (
                  <p className="glass rounded-3xl p-4 text-sm text-muted-foreground text-center">
                    {t("appHealth.noErrors")}
                  </p>
                ) : (
                  data.top.map((e, i) => (
                    <article key={i} className="glass rounded-2xl p-3">
                      <p className="text-sm font-bold break-words" dir="auto">
                        {e.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("appHealth.topRow", {
                          times: e.occurrences,
                          users: e.users,
                          url: e.url ?? "—",
                          last: fmt(e.last_seen),
                        })}
                      </p>
                    </article>
                  ))
                )}
              </section>
              <p className="text-xs text-muted-foreground text-center">
                {t("appHealth.alertRule")}
              </p>
            </>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl p-3 text-center">
      <p className="text-xl font-black tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
