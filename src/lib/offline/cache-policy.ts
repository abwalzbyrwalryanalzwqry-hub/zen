/**
 * سياسة حافظة «دون اتصال» (H7، المرحلة 2.4). كانت `zen-api-v1` تنمو بلا حدّ وبلا انتهاء صلاحية، وتخزّن
 * ملفات Storage (صوت وصور) مهما كبرت، فتنمو مساحة التطبيق مع كثرة المحادثات والرسائل الصوتية.
 *
 *  - انتهاء صلاحية: نسخة أقدم من 30 يوماً لا تُعرض وتُحذف.
 *  - حدّ أقصى: 400 مدخل و25 ميغابايت، ويُحذف الأقدم استعمالاً أولاً (LRU).
 *  - الوسائط: لا تُخزَّن الملفات الصوتية ولا أي ملف أكبر من 512 كيلوبايت؛ الرسائل الصوتية المرسلة
 *    من الجهاز تبقى في صندوق الإرسال على الجهاز حتى تُرفع (M9).
 *
 * الفهرس (المفتاح ← وقت الحفظ ووقت آخر استعمال والحجم) في localStorage؛ المنطق دوال نقية للاختبار.
 */

export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 400;
export const CACHE_MAX_BYTES = 25 * 1024 * 1024;
export const MEDIA_MAX_BYTES = 512 * 1024;
export const CACHE_INDEX_KEY = "zen-api-index-v1";

export type IndexEntry = { savedAt: number; usedAt: number; size: number };
export type CacheIndex = Record<string, IndexEntry>;

/** هل تُخزَّن هذه الاستجابة؟ قراءات REST/RPC دائماً؛ ملفات Storage إن لم تكن صوتاً ولا كبيرة. */
export function shouldCache(
  path: string,
  contentType: string | null,
  size: number | null,
): boolean {
  if (!path.startsWith("/storage/v1/")) return true;
  const type = (contentType ?? "").toLowerCase();
  if (type.startsWith("audio/") || type.startsWith("video/")) return false;
  if (size === null) return false; // حجم مجهول (بث مجزّأ): لا نخاطر
  return size <= MEDIA_MAX_BYTES;
}

export function isExpired(entry: IndexEntry | undefined, now: number): boolean {
  return !entry || now - entry.savedAt > CACHE_MAX_AGE_MS;
}

/** المفاتيح الواجب حذفها: المنتهية أولاً، ثم الأقدم استعمالاً حتى يعود الحجم والعدد تحت الحدّ. */
export function evictionPlan(index: CacheIndex, now: number): string[] {
  const out = new Set<string>();
  const live: [string, IndexEntry][] = [];
  for (const [k, e] of Object.entries(index)) {
    if (isExpired(e, now)) out.add(k);
    else live.push([k, e]);
  }
  live.sort((a, b) => a[1].usedAt - b[1].usedAt);
  let bytes = live.reduce((s, [, e]) => s + e.size, 0);
  let count = live.length;
  for (const [k, e] of live) {
    if (count <= CACHE_MAX_ENTRIES && bytes <= CACHE_MAX_BYTES) break;
    out.add(k);
    count -= 1;
    bytes -= e.size;
  }
  return [...out];
}

export function readIndex(): CacheIndex {
  try {
    const raw = localStorage.getItem(CACHE_INDEX_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === "object" ? (v as CacheIndex) : {};
  } catch {
    return {};
  }
}

export function writeIndex(index: CacheIndex): void {
  try {
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  } catch {
    /* التخزين ممتلئ: يكفي ما في الحافظة */
  }
}

export function clearIndex(): void {
  try {
    localStorage.removeItem(CACHE_INDEX_KEY);
  } catch {
    /* لا شيء */
  }
}

/* ─────────── «آخر تحديث منذ…» (3.9) ───────────
 * كل استجابة تُعرض من الحافظة تسجّل وقت حفظها؛ الشريط العلوي يعرض أقدمها منذ آخر اتصال ناجح. */

const STALE_EVENT = "zen:offline-stale";
let oldestServed: number | null = null;

/** تُستدعى عند عرض نسخة محفوظة. */
export function noteServedFromCache(savedAt: number): void {
  if (oldestServed !== null && oldestServed <= savedAt) return;
  oldestServed = savedAt;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STALE_EVENT));
}

/** تُستدعى عند نجاح قراءة حيّة: البيانات المعروضة حديثة من جديد. */
export function noteFreshRead(): void {
  if (oldestServed === null) return;
  oldestServed = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STALE_EVENT));
}

export function staleSince(): number | null {
  return oldestServed;
}

export function onStaleChange(fn: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(STALE_EVENT, fn);
  return () => window.removeEventListener(STALE_EVENT, fn);
}
