import { useQuery } from "@tanstack/react-query";
import { Flag, TrendingUp } from "lucide-react";
import { todayKey } from "@/lib/reminders";
import { fetchMemorizeDates, forecastKhatm, humanDuration, TOTAL_PAGES } from "@/lib/forecast";

/** بطاقة توقّع الختم (8.5): في /today للطالب، وفي ملف الطالب عند معلّمه. */
export function KhatmForecastCard({
  studentId,
  title = "توقّع الختم",
}: {
  studentId: string;
  title?: string;
}) {
  const q = useQuery({
    queryKey: ["khatm-forecast", studentId],
    staleTime: 10 * 60_000,
    queryFn: () => fetchMemorizeDates(studentId),
  });
  if (!q.data) return null;
  const f = forecastKhatm(q.data, todayKey());
  if (f.status === "no-data") return null;
  const pct = Math.round((f.memorized / TOTAL_PAGES) * 100);

  return (
    <section aria-label={title} className="glass rounded-3xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Flag className="w-4 h-4 text-gold" aria-hidden="true" />
        <h2 className="text-sm font-black flex-1">{title}</h2>
        <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
          {f.memorized}/{TOTAL_PAGES} صفحة · {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
        <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
      </div>
      {f.status === "done" && (
        <p className="text-xs font-bold text-primary">ختم القرآن حفظاً. بارك الله فيه.</p>
      )}
      {f.status === "stalled" && (
        <p className="text-xs text-muted-foreground">
          لا حفظ جديد منذ {f.lastDay}. بقي {f.remaining} صفحة؛ صفحة واحدة يومياً تُتمّها في{" "}
          {humanDuration(f.remaining)}.
        </p>
      )}
      {f.status === "ok" && (
        <>
          <p className="text-xs">
            بمعدّلك الحالي ({f.rate} صفحة/يوم) يتمّ الختم في <b>{humanDuration(f.days)}</b> — نحو{" "}
            {f.date}.
          </p>
          <p className="text-[0.6875rem] text-muted-foreground flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
            بزيادة صفحة يومياً: {humanDuration(f.plusOne.days)} ({f.plusOne.date})، أي أبكر بـ{" "}
            {humanDuration(f.plusOne.savedDays)}.
          </p>
        </>
      )}
    </section>
  );
}
