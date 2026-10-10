/* زِن — السجل اليومي لقراءة القرآن (منقول من سجل منار اليومي، الجزء الخاص بالقرآن).
 *
 * قيد واحد لكل يوم بعدد الآيات المقروءة، بالتوقيت المحلي. تستعمله الختمة المخطّطة
 * (dayKey/shiftDayKey) وسجل القراءة (recordAyahs).
 */

const KEY = "zen.quran.activity.v1";
const EVENT = "zen:quran-activity";
/** أقصى عدد أيام محفوظة (سنتان) — يمنع نمو التخزين بلا حدّ. */
const MAX_DAYS = 730;

/** `YYYY-MM-DD` بالتوقيت المحلي. `toISOString` يعطي UTC فيُزحزح اليوم. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftDayKey(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + delta));
}

export type QuranActivity = Record<string, number>;

export function readQuranActivity(): QuranActivity {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: QuranActivity = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === "number" && Number.isFinite(v) && v > 0) {
        out[k] = Math.trunc(v);
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** يضيف عدد الآيات المقروءة إلى قيد اليوم. */
export function recordAyahs(count: number, date = new Date()) {
  if (typeof window === "undefined" || !Number.isFinite(count) || count <= 0) return;
  const log = readQuranActivity();
  const k = dayKey(date);
  log[k] = (log[k] ?? 0) + Math.trunc(count);
  const keys = Object.keys(log).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_DAYS))) delete log[old];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(log));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* تخزين ممتلئ أو محظور */
  }
}
