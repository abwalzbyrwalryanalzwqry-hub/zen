/**
 * «محاسبتي» — إحصاءات الفترة ومراجعة الأسبوع (M5: من logic.ts دون تغيير السلوك؛ يُعاد تصديرها منه).
 * المبادئ الملزمة في رأس `logic.ts`.
 */

import { dayRange } from "./dates";
import {
  FOCUS_LABEL,
  FOCUS_OPTIONS,
  PRAYER_LABEL,
  PRAYERS,
  type FocusKey,
  type Habit,
  type MuhasabaDay,
  type PrayerKey,
} from "./types";
import {
  hasEntry,
  isScheduled,
  memorizeDone,
  quranDone,
  reviewDone,
  type QuranActivity,
} from "./logic";

// ─────────────────────── مراجعة الأسبوع ───────────────────────

export type PeriodInput = {
  from: string;
  to: string;
  days: MuhasabaDay[];
  habits: Habit[];
  quran: Record<string, QuranActivity>;
};

export type PeriodStats = {
  from: string;
  to: string;
  span: number;
  careDays: number;
  /** أيام سُجّلت فيها الصلوات الخمس كلها */
  prayerFullDays: number;
  onTimeTotal: number;
  /** لكل صلاة: عدد مرات «متأخرة» و«فاتتني» */
  prayerStruggle: Record<PrayerKey, number>;
  quranDays: number;
  reviewDays: number;
  memorizeDays: number;
  habitsDone: number;
  topHabits: { habit: Habit; count: number; scheduled: number }[];
  topFocus: { key: FocusKey; count: number }[];
  goalsSet: number;
  goalsKept: number;
};

export function periodStats({ from, to, days, habits, quran }: PeriodInput): PeriodStats {
  const range = dayRange(from, to);
  const byDay = new Map(days.map((d) => [d.day, d]));
  const struggle = Object.fromEntries(PRAYERS.map((p) => [p, 0])) as Record<PrayerKey, number>;
  let careDaysN = 0;
  let prayerFull = 0;
  let onTime = 0;
  let quranN = 0;
  let reviewN = 0;
  let memorizeN = 0;
  let habitsDone = 0;
  let goalsSet = 0;
  let goalsKept = 0;
  const focusCount = new Map<FocusKey, number>();
  const habitCount = new Map<string, { done: number; scheduled: number }>();

  for (const day of range) {
    const d = byDay.get(day);
    const q = quran[day];
    if (hasEntry(d)) careDaysN++;
    if (quranDone(q, d)) quranN++;
    if (reviewDone(q, d)) reviewN++;
    if (memorizeDone(q, d)) memorizeN++;
    for (const h of habits) {
      const doneToday = !!d?.habits_done.includes(h.id);
      if (!isScheduled(h, day) && !doneToday) continue;
      const c = habitCount.get(h.id) ?? { done: 0, scheduled: 0 };
      c.scheduled++;
      if (doneToday) c.done++;
      habitCount.set(h.id, c);
    }
    if (!d) continue;
    if (PRAYERS.every((p) => d.prayers[p])) prayerFull++;
    for (const p of PRAYERS) {
      const s = d.prayers[p];
      if (s === "on_time") onTime++;
      else if (s === "late" || s === "missed") struggle[p]++;
    }
    habitsDone += d.habits_done.length;
    for (const f of d.focus) focusCount.set(f, (focusCount.get(f) ?? 0) + 1);
    if (d.goal_text) {
      goalsSet++;
      if (d.goal_result === "kept") goalsKept++;
    }
  }

  const topHabits = habits
    .map((habit) => ({
      habit,
      count: habitCount.get(habit.id)?.done ?? 0,
      scheduled: habitCount.get(habit.id)?.scheduled ?? 0,
    }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || a.habit.position - b.habit.position)
    .slice(0, 3);

  const topFocus = [...focusCount.entries()]
    .filter(([k]) => k !== "other")
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    from,
    to,
    span: range.length,
    careDays: careDaysN,
    prayerFullDays: prayerFull,
    onTimeTotal: onTime,
    prayerStruggle: struggle,
    quranDays: quranN,
    reviewDays: reviewN,
    memorizeDays: memorizeN,
    habitsDone,
    topHabits,
    topFocus,
    goalsSet,
    goalsKept,
  };
}

const IMPROVED_TEXT = {
  reviewDays: "المراجعة أصبحت أكثر انتظاماً.",
  quranDays: "صلتك بالقرآن صارت أكثر حضوراً في أيامك.",
  onTimeTotal: "صلواتك في وقتها ازدادت.",
  habitsDone: "التزامك بعاداتك ازداد.",
  careDays: "وقفاتك مع نفسك صارت أكثر.",
} as const;

export type WeeklyReview = {
  stats: PeriodStats;
  improved: string | null;
  needsCare: { text: string; key: FocusKey | null } | null;
  suggestedGoal: { key: FocusKey | null; text: string } | null;
};

/** يختار «شيئاً تحسّن» و«شيئاً يحتاج عناية» — بلغة وصفية لا حكم فيها. */
export function weeklyReview(current: PeriodStats, previous: PeriodStats | null): WeeklyReview {
  let improved: string | null = null;
  if (previous) {
    const metrics = Object.keys(IMPROVED_TEXT) as (keyof typeof IMPROVED_TEXT)[];
    let best = 0;
    for (const m of metrics) {
      const prev = previous[m];
      const cur = current[m];
      // نسبة التحسّن مع حدّ أدنى للفرق حتى لا تُعدّ الزيادة التافهة تحسّناً.
      const delta = cur - prev;
      if (delta < 2 && !(prev === 0 && cur >= 2)) continue;
      const score = delta / Math.max(prev, 1);
      if (score > best) {
        best = score;
        improved = IMPROVED_TEXT[m];
      }
    }
  }

  let needsCare: WeeklyReview["needsCare"] = null;
  const worst = [...PRAYERS].sort(
    (a, b) => current.prayerStruggle[b] - current.prayerStruggle[a],
  )[0];
  if (current.prayerStruggle[worst] >= 2) {
    needsCare = { text: `المحافظة على ${PRAYER_LABEL[worst]} في وقتها.`, key: "prayer_on_time" };
  } else if (current.topFocus[0] && current.topFocus[0].count >= 2) {
    needsCare = { text: `${FOCUS_LABEL[current.topFocus[0].key]}.`, key: current.topFocus[0].key };
  } else if (current.span >= 7 && current.careDays > 0 && current.reviewDays <= 1) {
    needsCare = { text: "انتظام المراجعة.", key: "review" };
  }

  let suggestedGoal: WeeklyReview["suggestedGoal"] = null;
  if (needsCare?.key === "prayer_on_time") {
    suggestedGoal = {
      key: "prayer_on_time",
      text: `هذا الأسبوع سأحافظ على صلاة ${PRAYER_LABEL[worst]} في وقتها.`,
    };
  } else if (needsCare?.key) {
    const opt = FOCUS_OPTIONS.find((f) => f.key === needsCare!.key);
    if (opt?.pledge)
      suggestedGoal = { key: opt.key, text: opt.pledge.replace(/^غداً/, "هذا الأسبوع") };
  }

  return { stats: current, improved, needsCare, suggestedGoal };
}

// ─────────────────────── رحلتي (الشهر) ───────────────────────

export type Trend = "up" | "same" | "down" | "new";

export function trend(cur: number, prev: number | null): Trend {
  if (prev === null) return "new";
  if (cur > prev) return "up";
  if (cur < prev) return "down";
  return "same";
}

/** وصف لطيف للفرق عن الشهر السابق — لا يذكر «التراجع» بلوم. */
export function trendText(t: Trend, diff: number): string {
  switch (t) {
    case "up":
      return `+${diff} عن الشهر السابق`;
    case "down":
      return "أقل من الشهر السابق، ولا بأس";
    case "same":
      return "مثل الشهر السابق";
    default:
      return "أول شهر لك هنا";
  }
}
