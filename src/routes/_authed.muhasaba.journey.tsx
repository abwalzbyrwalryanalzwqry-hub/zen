import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BottomNav } from "@/components/zen/BottomNav";
import { useSession } from "@/hooks/useSession";
import { useMuhasaba } from "@/lib/muhasaba/useMuhasaba";
import {
  careDays,
  growthStage,
  hasEntry,
  periodStats,
  trend,
  trendText,
} from "@/lib/muhasaba/logic";
import {
  addDays,
  daysLabel,
  dayRange,
  isoDay,
  monthName,
  monthStart,
  parseDay,
} from "@/lib/muhasaba/dates";
import { SectionTitle } from "@/components/muhasaba/parts";

export const Route = createFileRoute("/_authed/muhasaba/journey")({
  head: () => ({ meta: [{ title: "رحلتي — محاسبتي" }] }),
  component: JourneyScreen,
});

function pledgesLabel(n: number): string {
  if (n === 1) return "عهداً واحداً";
  if (n === 2) return "عهدين";
  if (n <= 10) return `${n} عهود`;
  return `${n} عهداً`;
}

function JourneyScreen() {
  const { userId } = useSession();
  const thisMonth = monthStart(isoDay());
  const prevMonth = monthStart(addDays(thisMonth, -1));
  const m = useMuhasaba(userId, { from: prevMonth });
  const today = m.today;

  const data = useMemo(() => {
    const input = { days: m.days, habits: m.habits, quran: m.quran };
    const cur = periodStats({ from: thisMonth, to: today, ...input });
    const prev = periodStats({ from: prevMonth, to: addDays(thisMonth, -1), ...input });
    const hadPrev = prev.careDays > 0 || prev.quranDays > 0;
    return { cur, prev: hadPrev ? prev : null };
  }, [m.days, m.habits, m.quran, thisMonth, prevMonth, today]);

  const care30 = careDays(m.days, today, 30);
  const stage = growthStage(care30.count);
  const byDay = new Map(m.days.map((d) => [d.day, d]));
  const cells = dayRange(thisMonth, today);
  // إزاحة أول يوم ليبدأ الشبك بالسبت.
  const lead = (parseDay(thisMonth).getDay() + 1) % 7;

  const { cur, prev } = data;
  const rows: { label: string; value: number; prev: number | null }[] = [
    { label: "أيام المحاسبة", value: cur.careDays, prev: prev?.careDays ?? null },
    { label: "أيام وِرد القرآن", value: cur.quranDays, prev: prev?.quranDays ?? null },
    { label: "أيام المراجعة", value: cur.reviewDays, prev: prev?.reviewDays ?? null },
    { label: "صلوات سجّلتها في وقتها", value: cur.onTimeTotal, prev: prev?.onTimeTotal ?? null },
  ];

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">رحلتي</h1>
            <p className="text-[0.6875rem] text-muted-foreground">{monthName(thisMonth)}</p>
          </div>
          <Link
            to="/muhasaba"
            aria-label="رجوع إلى محاسبتي"
            className="w-9 h-9 rounded-xl glass flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </Link>
        </header>

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
          {!m.ready ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary" aria-label="جارٍ التحميل" />
            </div>
          ) : (
            <>
              <section className="glass rounded-3xl p-4 flex items-center gap-3">
                <span className="text-4xl" aria-hidden>
                  {stage.emoji}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground">{stage.label}</p>
                  <p className="text-[0.6875rem] text-muted-foreground">{stage.hint}</p>
                  <p className="text-[0.6875rem] text-muted-foreground">
                    {care30.count} من أصل {care30.total} يوماً اعتنيت فيها بنفسك
                  </p>
                </div>
              </section>

              <div
                className="flex justify-center gap-4 text-[0.625rem] text-muted-foreground"
                aria-hidden
              >
                <span>🌱 البداية</span>
                <span>🌿 الاستمرار</span>
                <span>🌳 الثبات</span>
              </div>

              <section className="space-y-2" aria-labelledby="cal-title">
                <SectionTitle>
                  <span id="cal-title">أيام هذا الشهر</span>
                </SectionTitle>
                <div className="glass rounded-3xl p-3">
                  <div className="grid grid-cols-7 gap-1.5">
                    {["س", "ح", "ن", "ث", "ر", "خ", "ج"].map((d) => (
                      <span
                        key={d}
                        className="text-center text-[0.625rem] text-muted-foreground"
                        aria-hidden
                      >
                        {d}
                      </span>
                    ))}
                    {Array.from({ length: lead }).map((_, i) => (
                      <span key={`lead-${i}`} />
                    ))}
                    {cells.map((d) => {
                      const on = hasEntry(byDay.get(d));
                      return (
                        <span
                          key={d}
                          title={d}
                          aria-label={`${Number(d.slice(8))}: ${on ? "وقفت مع نفسك" : "لا تسجيل"}`}
                          className={`aspect-square rounded-lg flex items-center justify-center text-[0.625rem] font-semibold ${
                            on
                              ? "bg-primary/80 text-primary-foreground"
                              : "bg-muted/50 text-muted-foreground"
                          } ${d === today ? "ring-2 ring-gold" : ""}`}
                        >
                          {Number(d.slice(8))}
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-[0.625rem] text-muted-foreground mt-2">
                    الأيام الملوّنة هي الأيام التي وقفت فيها مع نفسك. لا شيء يُحسب عليك في غيرها.
                  </p>
                </div>
              </section>

              <section className="space-y-2">
                <SectionTitle>مقارنة بشهرك السابق</SectionTitle>
                <ul className="glass rounded-3xl p-3 space-y-2">
                  {rows.map((r) => {
                    const t = trend(r.value, r.prev);
                    return (
                      <li key={r.label} className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-semibold text-foreground">
                          {r.label}
                        </span>
                        <span className="text-sm font-black text-primary">{r.value}</span>
                        <span className="w-32 text-end text-[0.625rem] text-muted-foreground">
                          {trendText(t, r.value - (r.prev ?? 0))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-[0.625rem] text-muted-foreground px-2">
                  المقارنة مع نفسك فقط — لا ترتيب ولا مقارنة بأحد.
                </p>
              </section>

              {cur.topHabits.length > 0 && (
                <section className="space-y-2">
                  <SectionTitle>أكثر العادات ثباتاً</SectionTitle>
                  <ul className="glass rounded-3xl p-3 space-y-1.5">
                    {cur.topHabits.map((t) => (
                      <li key={t.habit.id} className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-foreground">{t.habit.title}</span>
                        <span className="text-[0.6875rem] text-muted-foreground">
                          {daysLabel(t.count)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {cur.goalsSet > 0 && (
                <div className="glass rounded-3xl p-4">
                  <p className="text-sm text-foreground">
                    🌙 اخترت لنفسك {pledgesLabel(cur.goalsSet)} هذا الشهر
                    {cur.goalsKept > 0 ? `، ووُفّقت إلى ${cur.goalsKept} منها` : ""}.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <BottomNav />
      </div>
    </PhoneFrame>
  );
}
