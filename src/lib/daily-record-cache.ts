/**
 * نسخة الجهاز لآخر أوراق السجل اليومي (DR-10)، في وحدة مستقلة كي لا تدخل الحزمة الأولى.
 */
import type { DaySheet } from "@/lib/daily-record";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function store(): Store | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export const DAILY_CACHE_KEY = "zen.daily.cache";
// 40 ورقة (كانت 7): أسابيع من أيام الحلقات كلها للمعلّم دون اتصال (1.16.0)، نحو 10KB للورقة.
export const CACHE_MAX = 40;
interface CacheEntry {
  key: string;
  saved_at: string;
  sheet: DaySheet;
}
const cacheKey = (halaqa: string, date: string) => `${halaqa}|${date}`;

function readCache(s: Store | null): CacheEntry[] {
  try {
    const v = JSON.parse(s?.getItem(DAILY_CACHE_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** يحفظ ورقة الطلب (الحلقة، اليوم) — الأحدث أولاً، CACHE_MAX ورقة على الأكثر. */
export function cacheSheet(
  halaqa: string,
  date: string,
  sheet: DaySheet,
  s: Store | null = store(),
  now = new Date(),
) {
  if (!s) return;
  const key = cacheKey(halaqa, date);
  const { cached_at: _drop, ...clean } = sheet;
  void _drop;
  const next = [
    { key, saved_at: now.toISOString(), sheet: clean },
    ...readCache(s).filter((e) => e.key !== key),
  ].slice(0, CACHE_MAX);
  try {
    s.setItem(DAILY_CACHE_KEY, JSON.stringify(next));
  } catch {
    /* المساحة ممتلئة: النسخة اختيارية */
  }
}

/** الورقة المحفوظة لهذا اليوم مع وقت حفظها، أو null. */
export function cachedSheet(
  halaqa: string,
  date: string,
  s: Store | null = store(),
): DaySheet | null {
  const e = readCache(s).find((x) => x.key === cacheKey(halaqa, date));
  return e ? { ...e.sheet, cached_at: e.saved_at } : null;
}

/** أحدث نسخة محفوظة لهذه الحلقة (أي يوم) مع وقت حفظها: أساس يوم جديد دون اتصال (1.16.0). */
export function latestSheet(halaqa: string, s: Store | null = store()): DaySheet | null {
  const e = readCache(s)
    .filter((x) => x.key.startsWith(`${halaqa}|`))
    .sort((a, b) => (a.sheet.date < b.sheet.date ? 1 : a.sheet.date > b.sheet.date ? -1 : 0))[0];
  return e ? { ...e.sheet, cached_at: e.saved_at } : null;
}

/** كل أوراق الحلقة المحفوظة مع وقت حفظها (للتقارير دون اتصال، 1.16.0). */
export function sheetsFor(
  halaqa: string,
  s: Store | null = store(),
): Array<{ sheet: DaySheet; saved_at: string }> {
  return readCache(s)
    .filter((x) => x.key.startsWith(`${halaqa}|`))
    .map((x) => ({ sheet: x.sheet, saved_at: x.saved_at }));
}
