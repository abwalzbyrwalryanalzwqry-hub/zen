import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Loader2, Sparkles, Sprout, TrendingUp } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BottomNav } from "@/components/zen/BottomNav";
import { useSession } from "@/hooks/useSession";
import { useMuhasaba } from "@/lib/muhasaba/useMuhasaba";
import { periodStats, weeklyReview } from "@/lib/muhasaba/logic";
import { addDays, daysLabel, isoDay, shortDate, weekStart } from "@/lib/muhasaba/dates";
import { loadWeekGoal, saveWeekGoal } from "@/lib/muhasaba/storage";
import { FOCUS_LABEL } from "@/lib/muhasaba/types";
import { Chip, SectionTitle } from "@/components/muhasaba/parts";

export const Route = createFileRoute("/_authed/muhasaba/week")({
  head: () => ({ meta: [{ title: "مراجعة الأسبوع — محاسبتي" }] }),
  component: WeekScreen,
});

function WeekScreen() {
  const { userId } = useSession();
  const [offset, setOffset] = useState(0); // 0 = هذا الأسبوع، -1 = الأسبوع الماضي
  const todayStart = weekStart(isoDay());
  const from = addDays(todayStart, 7 * offset);
  const prevFrom = addDays(from, -7);
  const m = useMuhasaba(userId, { from: prevFrom });
  const today = m.today;
  const to = offset === 0 ? today : addDays(from, 6);

  const review = useMemo(() => {
    const cur = periodStats({ from, to, days: m.days, habits: m.habits, quran: m.quran });
    const prev = periodStats({
      from: prevFrom,
      to: addDays(from, -1),
      days: m.days,
      habits: m.habits,
      quran: m.quran,
    });
    return weeklyReview(cur, prev.careDays > 0 || prev.quranDays > 0 ? prev : null);
  }, [from, to, prevFrom, m.days, m.habits, m.quran]);

  const nextWeek = addDays(from, 7);
  const [goal, setGoal] = useState("");
  const [goalKey, setGoalKey] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // أسبوع آخر: يبدأ الهدف فارغاً حتى يصل المحفوظ — أثناء العرض لا في الأثر (M12).
  const goalFor = `${userId}|${nextWeek}`;
  const [shownGoalFor, setShownGoalFor] = useState(goalFor);
  if (shownGoalFor !== goalFor) {
    setShownGoalFor(goalFor);
    setSaved(null);
    setGoal("");
  }

  useEffect(() => {
    if (!userId) return;
    void loadWeekGoal(userId, nextWeek).then((g) => {
      if (g) {
        setSaved(g.goal_text);
        setGoal(g.goal_text);
        setGoalKey(g.goal_key);
      }
    });
  }, [userId, nextWeek]);

  const s = review.stats;
  const empty = s.careDays === 0 && s.quranDays === 0;

  const commitGoal = async () => {
    if (!userId || !goal.trim() || saving) return;
    setSaving(true);
    setErr(null);
    try {
      await saveWeekGoal(userId, nextWeek, { key: goalKey, text: goal });
      setSaved(goal.trim());
    } catch {
      setErr("لم يُحفظ الهدف الآن. تحقّق من الاتصال وأعد المحاولة.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">مراجعة الأسبوع</h1>
            <p className="text-[0.6875rem] text-muted-foreground">
              {shortDate(from)} — {shortDate(to)}
            </p>
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
          <div className="flex gap-2 px-2">
            <Chip active={offset === 0} onClick={() => setOffset(0)}>
              هذا الأسبوع
            </Chip>
            <Chip active={offset === -1} onClick={() => setOffset(-1)}>
              الأسبوع الماضي
            </Chip>
          </div>

          {!m.ready ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary" aria-label="جارٍ التحميل" />
            </div>
          ) : empty ? (
            <div className="glass rounded-3xl p-6 text-center space-y-2">
              <p className="text-3xl" aria-hidden>
                🌱
              </p>
              <p className="text-sm font-bold text-foreground">لا وقفات مسجّلة في هذا الأسبوع</p>
              <p className="text-[0.6875rem] text-muted-foreground">
                كل أسبوع بداية جديدة. دقيقة واحدة اليوم تكفي.
              </p>
              <Link
                to="/muhasaba"
                className="inline-block mt-2 min-h-10 px-5 py-2.5 rounded-2xl bg-primary text-primary-foreground text-xs font-semibold"
              >
                افتح محاسبة اليوم
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="أيام وقفت فيها مع نفسك" value={`${s.careDays} من ${s.span}`} />
                <Stat label="أيام سجّلت فيها صلواتك الخمس" value={`${s.prayerFullDays}`} />
                <Stat label="أيام مع القرآن" value={`${s.quranDays}`} />
                <Stat label="أيام المراجعة" value={`${s.reviewDays}`} />
              </div>

              {s.topHabits.length > 0 && (
                <section className="space-y-2">
                  <SectionTitle>أكثر العادات التزاماً</SectionTitle>
                  <ul className="glass rounded-3xl p-3 space-y-1.5">
                    {s.topHabits.map((t) => (
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

              {s.topFocus.length > 0 && (
                <section className="space-y-2">
                  <SectionTitle>أكثر ما اخترت إصلاحه</SectionTitle>
                  <div className="glass rounded-3xl p-3 flex flex-wrap gap-1.5">
                    {s.topFocus.map((f) => (
                      <span
                        key={f.key}
                        className="px-3 py-1.5 rounded-2xl bg-primary/10 text-xs font-semibold text-foreground"
                      >
                        {FOCUS_LABEL[f.key]} · {f.count}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              <div className="glass rounded-3xl p-4 flex gap-3">
                <TrendingUp className="w-5 h-5 text-primary shrink-0" aria-hidden />
                <div>
                  <p className="text-xs font-bold text-muted-foreground">شيء تحسّن هذا الأسبوع</p>
                  <p className="text-sm text-foreground">
                    {review.improved ?? "حضورك هنا هذا الأسبوع بحدّ ذاته خطوة جميلة."}
                  </p>
                </div>
              </div>

              <div className="glass rounded-3xl p-4 flex gap-3">
                <Sprout className="w-5 h-5 text-gold shrink-0" aria-hidden />
                <div>
                  <p className="text-xs font-bold text-muted-foreground">شيء يحتاج عناية</p>
                  <p className="text-sm text-foreground">
                    {review.needsCare?.text ?? "اختر بنفسك جانباً صغيراً تعتني به."}
                  </p>
                </div>
              </div>
            </>
          )}

          {m.ready && (
            <section
              className="glass rounded-3xl p-4 space-y-3 border border-gold/30"
              aria-labelledby="wg-title"
            >
              <h2 id="wg-title" className="text-sm font-bold text-foreground">
                🌙 هدف الأسبوع القادم
              </h2>
              {review.suggestedGoal && goal !== review.suggestedGoal.text && !saved && (
                <button
                  onClick={() => {
                    setGoal(review.suggestedGoal!.text);
                    setGoalKey(review.suggestedGoal!.key);
                  }}
                  className="w-full text-start glass rounded-2xl px-3 py-2 text-xs text-foreground"
                >
                  <Sparkles className="inline w-3 h-3 text-gold me-1 -mt-0.5" aria-hidden />
                  {review.suggestedGoal.text}
                </button>
              )}
              <label htmlFor="week-goal" className="sr-only">
                هدف الأسبوع القادم
              </label>
              <input
                id="week-goal"
                value={goal}
                maxLength={120}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="هدف واحد صغير للأسبوع القادم"
                className="w-full glass rounded-2xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                onClick={() => void commitGoal()}
                disabled={!goal.trim() || saving || goal.trim() === saved}
                className="w-full min-h-11 rounded-2xl bg-gold text-gold-foreground text-xs font-bold disabled:opacity-60"
              >
                {saving
                  ? "يُحفظ…"
                  : saved && goal.trim() === saved
                    ? "✓ اعتمدت هدفك"
                    : "اعتمد الهدف"}
              </button>
              {err && (
                <p role="alert" className="text-[0.6875rem] text-destructive">
                  {err}
                </p>
              )}
            </section>
          )}
        </div>

        <BottomNav />
      </div>
    </PhoneFrame>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-3 text-center">
      <p className="text-sm font-black text-primary">{value}</p>
      <p className="text-[0.625rem] text-muted-foreground">{label}</p>
    </div>
  );
}
