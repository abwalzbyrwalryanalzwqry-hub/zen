/**
 * منطق «محاسبتي» — دوال خالصة بلا شبكة ولا تخزين، ومغطّاة باختبارات.
 *
 * مبادئ مُلزِمة في هذا الملف:
 *  - لا شيء يُستنتج من الغياب: صلاة لم تُسجَّل = «لم تُسجَّل»، لا «فاتتني».
 *  - لا سلسلة تنكسر: الاستمرارية تُعدّ «أيام اعتنيت فيها بنفسك» من مدة، لا أياماً متتالية.
 *  - لا مقياس لما لا يُقاس: الأرقام تصف ما سجّله الطالب من عاداته، لا «صلاحه».
 */

import { addDays, daysBetween, weekday } from "./dates";
import {
  CLOSING_DUAS,
  DAILY_MESSAGES,
  FOCUS_OPTIONS,
  PRAYERS,
  type FocusKey,
  type GoalResult,
  type Habit,
  type MoodKey,
  type MuhasabaDay,
  type MuhasabaSettings,
  type PrayerKey,
  type PrayerStatus,
  type QuranSelfKey,
} from "./types";
import { localDayOf } from "@/lib/local-day";
export * from "./week-review";

const stamp = (now?: Date) => (now ?? new Date()).toISOString();

// ─────────────────────── تعديلات اليوم ───────────────────────

/** يسجّل حالة صلاة؛ والنقر على الحالة نفسها مرة ثانية يلغي التسجيل. */
export function setPrayer(
  d: MuhasabaDay,
  key: PrayerKey,
  status: PrayerStatus,
  now?: Date,
): MuhasabaDay {
  const prayers = { ...d.prayers };
  if (prayers[key] === status) delete prayers[key];
  else prayers[key] = status;
  return { ...d, prayers, updated_at: stamp(now) };
}

export function toggleHabit(d: MuhasabaDay, habitId: string, now?: Date): MuhasabaDay {
  const has = d.habits_done.includes(habitId);
  const habits_done = has
    ? d.habits_done.filter((id) => id !== habitId)
    : [...d.habits_done, habitId];
  return { ...d, habits_done, updated_at: stamp(now) };
}

export function toggleQuranSelf(d: MuhasabaDay, key: QuranSelfKey, now?: Date): MuhasabaDay {
  const quran_self = { ...d.quran_self };
  if (quran_self[key]) delete quran_self[key];
  else quran_self[key] = true;
  return { ...d, quran_self, updated_at: stamp(now) };
}

export function setMood(d: MuhasabaDay, mood: MoodKey, now?: Date): MuhasabaDay {
  return { ...d, mood: d.mood === mood ? null : mood, updated_at: stamp(now) };
}

export function toggleFocus(d: MuhasabaDay, key: FocusKey, now?: Date): MuhasabaDay {
  const has = d.focus.includes(key);
  const focus = has ? d.focus.filter((k) => k !== key) : [...d.focus, key].slice(0, 12);
  return { ...d, focus, updated_at: stamp(now) };
}

export const NOTE_MAX = 500;
export const GOAL_MAX = 120;

export function setNote(d: MuhasabaDay, note: string, now?: Date): MuhasabaDay {
  const clean = note.slice(0, NOTE_MAX);
  return { ...d, note: clean.trim() ? clean : null, updated_at: stamp(now) };
}

/** عهد الغد: هدف واحد فقط — تعيينه يستبدل السابق. */
export function setGoal(
  d: MuhasabaDay,
  key: FocusKey | null,
  text: string,
  now?: Date,
): MuhasabaDay {
  const clean = text.trim().slice(0, GOAL_MAX);
  if (!clean)
    return { ...d, goal_key: null, goal_text: null, goal_result: null, updated_at: stamp(now) };
  // تغيير نص العهد يُسقط تقييماً قديماً لا يخصّه.
  const result = clean === d.goal_text ? d.goal_result : null;
  return { ...d, goal_key: key, goal_text: clean, goal_result: result, updated_at: stamp(now) };
}

/** تقييم عهد الأمس. يُكتب على صف اليوم الذي كُتب فيه العهد. */
export function rateGoal(d: MuhasabaDay, result: GoalResult, now?: Date): MuhasabaDay {
  if (!d.goal_text) return d;
  return { ...d, goal_result: d.goal_result === result ? null : result, updated_at: stamp(now) };
}

export function closeDay(d: MuhasabaDay, now?: Date): MuhasabaDay {
  return { ...d, closed_at: d.closed_at ?? stamp(now), updated_at: stamp(now) };
}

export function reopenDay(d: MuhasabaDay, now?: Date): MuhasabaDay {
  return { ...d, closed_at: null, updated_at: stamp(now) };
}

/** اقتراح نص العهد من أول جانب اختار الطالب إصلاحه. */
export function suggestedPledge(d: MuhasabaDay): { key: FocusKey; text: string } | null {
  for (const key of d.focus) {
    const opt = FOCUS_OPTIONS.find((f) => f.key === key);
    if (opt?.pledge) return { key, text: opt.pledge };
  }
  return null;
}

// ─────────────────────── العادات ───────────────────────

/** العادات الظاهرة للإدارة: غير المحذوفة، بترتيبها. */
export function activeHabits(habits: Habit[]): Habit[] {
  return habits
    .filter((h) => !h.archived_at)
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
}

/** هل العادة مجدولة في هذا اليوم؟ */
export function isScheduled(h: Habit, day: string): boolean {
  if (localDayOf(h.created_at) > day) return false;
  if (h.archived_at && localDayOf(h.archived_at) <= day) return false;
  if (h.days && h.days.length > 0 && !h.days.includes(weekday(day))) return false;
  return true;
}

/** عادات اليوم: المجدولة وغير الموقوفة. */
export function habitsForDay(habits: Habit[], day: string): Habit[] {
  return activeHabits(habits).filter((h) => !h.paused && isScheduled(h, day));
}

/** نقل عادة خطوة لأعلى أو لأسفل؛ يعيد القائمة بمواضع متتالية جديدة. */
export function moveHabit(habits: Habit[], id: string, dir: -1 | 1): Habit[] {
  const list = activeHabits(habits);
  const i = list.findIndex((h) => h.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list.map((h, k) => ({ ...h, position: k }));
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next.map((h, k) => ({ ...h, position: k }));
}

// ─────────────────────── القرآن ───────────────────────

export type QuranActivity = { memorize: boolean; review: boolean; recite: boolean };

export type QuranItem = {
  key: "memorize" | "review" | "recite" | "wird";
  label: string;
  done: boolean;
  /** auto = من سجلات التطبيق · self = سجّله الطالب بنفسه */
  source: "auto" | "self" | null;
};

/**
 * حالة القرآن لليوم. ما سجّله التطبيق يظهر تلقائياً ولا يُطلب من الطالب مرة
 * ثانية؛ وما لا يعرفه التطبيق (ورد التلاوة، حفظ في الحلقة لم يُسجَّل) يسجّله بنفسه.
 */
export function quranItems(auto: QuranActivity | undefined, d: MuhasabaDay): QuranItem[] {
  const a = auto ?? { memorize: false, review: false, recite: false };
  const s = d.quran_self;
  const item = (
    key: QuranItem["key"],
    label: string,
    autoDone: boolean,
    selfDone: boolean,
  ): QuranItem => ({
    key,
    label,
    done: autoDone || selfDone,
    source: autoDone ? "auto" : selfDone ? "self" : null,
  });
  return [
    item("memorize", "الحفظ الجديد", a.memorize, !!s.memorize),
    item("review", "المراجعة", a.review, !!s.review),
    item("recite", "التسميع", a.recite, false),
    item("wird", "ورد التلاوة", false, !!s.wird),
  ];
}

export function quranDone(auto: QuranActivity | undefined, d: MuhasabaDay | undefined): boolean {
  if (auto && (auto.memorize || auto.review || auto.recite)) return true;
  const s = d?.quran_self ?? {};
  return !!(s.wird || s.memorize || s.review);
}

export function reviewDone(auto: QuranActivity | undefined, d: MuhasabaDay | undefined): boolean {
  return !!(auto?.review || d?.quran_self.review);
}

export function memorizeDone(auto: QuranActivity | undefined, d: MuhasabaDay | undefined): boolean {
  return !!(auto?.memorize || d?.quran_self.memorize);
}

// ─────────────────────── ملخّص اليوم ───────────────────────

export type DaySummary = {
  prayers: { logged: number; onTime: number; total: number };
  quran: { done: number; total: number };
  habits: { done: number; total: number };
};

export function daySummary(
  d: MuhasabaDay,
  habits: Habit[],
  auto: QuranActivity | undefined,
): DaySummary {
  const logged = PRAYERS.filter((p) => d.prayers[p]).length;
  const onTime = PRAYERS.filter((p) => d.prayers[p] === "on_time").length;
  const q = quranItems(auto, d);
  const todays = habitsForDay(habits, d.day);
  const done = todays.filter((h) => d.habits_done.includes(h.id)).length;
  return {
    prayers: { logged, onTime, total: PRAYERS.length },
    quran: { done: q.filter((i) => i.done).length, total: q.length },
    habits: { done, total: todays.length },
  };
}

/** هل سجّل المستخدم شيئاً في هذا اليوم؟ (القرآن التلقائي لا يُحتسب هنا: هذه أيام «وقفته مع نفسه»). */
export function hasEntry(d: MuhasabaDay | undefined): boolean {
  if (!d) return false;
  return (
    Object.keys(d.prayers).length > 0 ||
    d.habits_done.length > 0 ||
    Object.values(d.quran_self).some(Boolean) ||
    !!d.mood ||
    d.focus.length > 0 ||
    !!d.note ||
    !!d.goal_text ||
    !!d.closed_at
  );
}

export type DayState = "empty" | "partial" | "closed";

export function dayState(d: MuhasabaDay | undefined): DayState {
  if (!d || !hasEntry(d)) return "empty";
  return d.closed_at ? "closed" : "partial";
}

// ─────────────────────── الاستمرارية ───────────────────────

export type WelcomeState =
  | "first" //         أول مرة
  | "active" //        سجّل شيئاً اليوم
  | "continuing" //    سجّل أمس
  | "missed_yesterday" // آخر تسجيل قبل يومين
  | "returning"; //    عاد بعد ثلاثة أيام فأكثر

export function welcomeState(days: MuhasabaDay[], today: string): WelcomeState {
  const logged = days.filter(hasEntry).map((d) => d.day);
  if (logged.includes(today)) return "active";
  const past = logged.filter((d) => d < today).sort();
  if (past.length === 0) return "first";
  const gap = daysBetween(past[past.length - 1], today);
  if (gap <= 1) return "continuing";
  if (gap === 2) return "missed_yesterday";
  return "returning";
}

export const WELCOME_TEXT: Record<Exclude<WelcomeState, "active" | "continuing">, string> = {
  first: "🌱 مساحة يومية تقف فيها مع نفسك.",
  missed_yesterday: "فاتك أمس؟ لا بأس، اليوم بداية جديدة.",
  returning: "🌱 أهلاً بعودتك.",
};

/** «أيام اعتنيت فيها بنفسك»: عدد الأيام المسجّلة من آخر `span` يوماً. */
export function careDays(
  days: MuhasabaDay[],
  today: string,
  span = 30,
): { count: number; total: number } {
  const from = addDays(today, -(span - 1));
  const set = new Set(
    days.filter((d) => d.day >= from && d.day <= today && hasEntry(d)).map((d) => d.day),
  );
  return { count: set.size, total: span };
}

export type GrowthStage = { emoji: string; label: string; hint: string };

/** مرحلة هادئة بحسب أيام الاعتناء من آخر 30 يوماً — بلا نقاط ولا ترتيب. */
export function growthStage(count30: number): GrowthStage {
  if (count30 >= 21) return { emoji: "🌳", label: "الثبات", hint: "عادة راسخة، بارك الله فيها." };
  if (count30 >= 7) return { emoji: "🌿", label: "الاستمرار", hint: "تنمو بهدوء يوماً بعد يوم." };
  return { emoji: "🌱", label: "البداية", hint: "كل غرس يبدأ صغيراً." };
}

/** عهد الأمس الذي يخصّ اليوم (إن وُجد). */
export function yesterdayPledge(days: MuhasabaDay[], today: string): MuhasabaDay | null {
  const y = addDays(today, -1);
  const row = days.find((d) => d.day === y);
  return row?.goal_text ? row : null;
}

// ─────────────────────── رسائل ───────────────────────

function dayNumber(day: string): number {
  return Math.floor(
    Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86_400_000,
  );
}

/** رسالة اليوم: تتبدّل كل يوم، ولا تتكرّر في يومين متتاليين. */
export function dailyMessage(day: string): string {
  return DAILY_MESSAGES[dayNumber(day) % DAILY_MESSAGES.length];
}

export function closingDua(day: string): string {
  return CLOSING_DUAS[dayNumber(day) % CLOSING_DUAS.length];
}

// ─────────────────────── التذكير ───────────────────────

/** هل حان التذكير؟ مرة واحدة في اليوم، بعد الوقت المختار، وليس إن أغلق يومه. */
export function reminderDue(
  s: Pick<MuhasabaSettings, "reminder_enabled" | "reminder_time">,
  now: Date,
  lastFiredDay: string | null,
  today: string,
  closedToday: boolean,
): boolean {
  if (!s.reminder_enabled || closedToday) return false;
  if (lastFiredDay === today) return false;
  const [h, m] = s.reminder_time.split(":").map(Number);
  const due = new Date(now);
  due.setHours(h || 0, m || 0, 0, 0);
  return now.getTime() >= due.getTime();
}

export const REMINDER_MESSAGES = [
  { title: "🌙 كيف كان يومك؟", body: "خذ دقيقة مع نفسك في «محاسبتي»." },
  { title: "حان وقت الوقفة مع النفس 🌿", body: "دقيقة واحدة تكفي." },
  { title: "🌱 إذا كان يومك انتهى", body: "خذ دقيقة مع نفسك." },
];

export function reminderMessage(day: string) {
  return REMINDER_MESSAGES[dayNumber(day) % REMINDER_MESSAGES.length];
}
