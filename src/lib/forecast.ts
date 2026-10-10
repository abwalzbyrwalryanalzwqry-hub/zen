import { supabase } from "@/integrations/supabase/client";

/**
 * توقّع الختم (8.5) — منطق خالص من سجل الحفظ الفعلي (أول تاريخ حُفظت فيه كل صفحة).
 * المعدّل = صفحات آخر نافذة (60 يوماً افتراضياً) ÷ أيامها الفعلية، بلا افتراض عن المستقبل.
 */
export const TOTAL_PAGES = 604;

export type Forecast =
  | { status: "done"; memorized: number }
  | { status: "no-data"; memorized: number }
  | { status: "stalled"; memorized: number; remaining: number; lastDay: string }
  | {
      status: "ok";
      memorized: number;
      remaining: number;
      /** صفحات في اليوم. */
      rate: number;
      days: number;
      date: string;
      /** أثر «+صفحة يومياً». */
      plusOne: { rate: number; days: number; date: string; savedDays: number };
    };

const DAY = 86_400_000;
const toDay = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
// حساب أيام صرف: toDay/fromDay كلاهما UTC فلا إزاحة منطقة (المدخلات أيام مجرّدة).
// eslint-disable-next-line no-restricted-syntax
const fromDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** أول تاريخ لكل صفحة من سجلات (page, date). */
export function firstDates(rows: Array<{ page: number; session_date: string }>): string[] {
  const first = new Map<number, string>();
  for (const r of rows) {
    const d = first.get(r.page);
    if (!d || r.session_date < d) first.set(r.page, r.session_date);
  }
  return [...first.values()];
}

export function forecastKhatm(
  dates: string[],
  today: string,
  opts: { windowDays?: number; stallDays?: number } = {},
): Forecast {
  const windowDays = opts.windowDays ?? 60;
  const stallDays = opts.stallDays ?? 30;
  const memorized = Math.min(TOTAL_PAGES, dates.length);
  if (memorized >= TOTAL_PAGES) return { status: "done", memorized };
  if (!memorized) return { status: "no-data", memorized };
  const t = toDay(today);
  const sorted = dates.map(toDay).sort((a, b) => a - b);
  const last = sorted[sorted.length - 1];
  const remaining = TOTAL_PAGES - memorized;
  if ((t - last) / DAY > stallDays)
    return { status: "stalled", memorized, remaining, lastDay: fromDay(last) };
  // النافذة لا تبدأ قبل أول صفحة محفوظة (حافظ جديد لا يُظلم بأيام لم يبدأ فيها).
  const start = Math.max(sorted[0], t - (windowDays - 1) * DAY);
  const span = Math.max(1, Math.round((t - start) / DAY) + 1);
  const inWindow = sorted.filter((d) => d >= start && d <= t).length;
  const rate = inWindow / span;
  if (rate <= 0) return { status: "stalled", memorized, remaining, lastDay: fromDay(last) };
  const days = Math.ceil(remaining / rate);
  const r1 = rate + 1;
  const d1 = Math.ceil(remaining / r1);
  return {
    status: "ok",
    memorized,
    remaining,
    rate: Math.round(rate * 100) / 100,
    days,
    date: fromDay(t + days * DAY),
    plusOne: {
      rate: Math.round(r1 * 100) / 100,
      days: d1,
      date: fromDay(t + d1 * DAY),
      savedDays: days - d1,
    },
  };
}

/** صيغة مقروءة للمدّة. */
export function humanDuration(days: number): string {
  if (days < 45) return `${days} يوماً`;
  if (days < 730) {
    const m = Math.round(days / 30);
    return `${m} ${m <= 10 ? "أشهر" : "شهراً"} تقريباً`;
  }
  return `${Math.round((days / 365) * 10) / 10} سنة تقريباً`;
}

/** سجل الحفظ للطالب (عبر RLS: الطالب نفسه أو معلّمه). */
export async function fetchMemorizeDates(studentId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("mushaf_records")
    .select("page, session_date")
    .eq("student_id", studentId)
    .eq("kind", "memorize")
    .limit(5000);
  if (error) throw error;
  return firstDates((data ?? []) as Array<{ page: number; session_date: string }>);
}
