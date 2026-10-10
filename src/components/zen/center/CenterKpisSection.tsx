import { lazy, Suspense } from "react";
import { TrendingUp } from "lucide-react";
import type { CenterKpis } from "@/lib/center";

const MonthlyTrendChart = lazy(() => import("./MonthlyTrendChart"));

const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

/** مؤشرات المركز (10.3): لكل حلقة في آخر 30 يوماً، والاتجاه الشهري. أعداد فقط بلا أسماء طلاب. */
export function CenterKpisSection({ kpis }: { kpis: CenterKpis }) {
  return (
    <section aria-label="مؤشرات الحلقات" className="glass-strong rounded-3xl p-4 space-y-3">
      <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
        <TrendingUp className="w-4 h-4 text-primary" aria-hidden="true" /> مؤشرات الحلقات (آخر 30
        يوماً)
      </p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="صفحات محفوظة" value={kpis.totals.pages_30} />
        <Stat label="الانتظام" value={pct(kpis.totals.regularity)} />
        <Stat label="منقطعون" value={kpis.totals.dropouts} warn={kpis.totals.dropouts > 0} />
      </div>
      {kpis.halaqat.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[0.6875rem]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-start font-medium py-1">الحلقة</th>
                <th className="font-medium">صفحة/طالب</th>
                <th className="font-medium">الانتظام</th>
                <th className="font-medium">التسرّب</th>
              </tr>
            </thead>
            <tbody>
              {kpis.halaqat.map((h) => (
                <tr key={h.id} className="border-t border-border/40" data-kpi-halaqa={h.id}>
                  <td className="py-1.5 font-bold truncate max-w-[8rem]">
                    {h.name}{" "}
                    <span className="text-muted-foreground font-normal">({h.students})</span>
                  </td>
                  <td className="text-center tabular-nums">{h.pages_per_student ?? "—"}</td>
                  <td className="text-center tabular-nums">{pct(h.regularity)}</td>
                  <td
                    className={`text-center tabular-nums ${(h.dropout_rate ?? 0) >= 30 ? "text-destructive font-bold" : ""}`}
                  >
                    <span dir="ltr">
                      {h.dropouts ? `${h.dropouts} (${pct(h.dropout_rate)})` : "0"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[0.625rem] text-muted-foreground">
        التسرّب: عضو بلا حضور ولا حفظ ولا تسميع منذ 30 يوماً.
      </p>
      <p className="text-xs font-bold text-foreground pt-1">الاتجاه الشهري</p>
      <div className="h-44" dir="ltr">
        <Suspense fallback={<div className="h-full animate-pulse rounded-xl bg-muted" />}>
          <MonthlyTrendChart monthly={kpis.monthly} />
        </Suspense>
      </div>
    </section>
  );
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className="glass rounded-2xl py-2">
      <p
        className={`text-base font-black tabular-nums ${warn ? "text-destructive" : "text-foreground"}`}
      >
        {value}
      </p>
      <p className="text-[0.625rem] text-muted-foreground">{label}</p>
    </div>
  );
}
