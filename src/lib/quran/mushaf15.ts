// ============================================================
// Zen — تخطيط مصحف المدينة (١٥ سطراً، طبعة V1) — المصدر الوحيد
// ------------------------------------------------------------
// ملف JSON صغير لكل صفحة في `public/data/quran/mushaf15/{page}.json` (نحو 4 كيلوبايت للصفحة،
// و2.4 ميغابايت للمصحف كله)، يُرسم بخط مجمع الملك فهد (KFGQPC Hafs) الموجود في `public/fonts/`.
// البيانات من Quran.com (`scripts/build-mushaf15.py`)، وتقسيم الصفحات يطابق بيانات Tanzil.
//
// كان في التطبيق نسختان من هذه الوحدة (`lib/mushaf15.ts` وهذه) بأنواع وثوابت ومحمّلين
// مختلفين، فاختلف الجزء بين القارئ والسجل. صارت `lib/mushaf15.ts` إعادة تصدير لهذه.
// ============================================================

import { hizbOfPage as hizbOf, juzOfPage as juzOf } from "./page-math";

/** كلمة: [آية، نص]. علامة نهاية الآية: [آية] (يرسمها خط الحفص دائرةً برقمها). */
export type Mushaf15Token = [ayah: number, text?: string];

export type Mushaf15Line =
  | { t: "h"; s: number } // اسم السورة
  | { t: "b"; s: number } // البسملة
  | { t?: undefined; s: number; w: Mushaf15Token[] }; // سطر آيات

export interface Mushaf15Page {
  p: number;
  l: Mushaf15Line[];
}

export const MUSHAF_TOTAL_PAGES = 604;
export const MUSHAF15_BASE = "/data/quran/mushaf15";
export const MUSHAF15_FONT = '"KFGQPC Hafs", "Amiri Quran", serif';

/** البسملة برسم مجمع الملك فهد (تطابق خط الحفص المستعمل في الصفحة). */
export const QPC_BASMALA = "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ";

export const mushafPageUrl = (page: number) => `${MUSHAF15_BASE}/${page}.json`;

export function clampPage(page: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(MUSHAF_TOTAL_PAGES, Math.max(1, Math.round(page)));
}

export function isAyahLine(line: Mushaf15Line): line is Extract<Mushaf15Line, { w: unknown }> {
  return "w" in line;
}

/** الصفحتان الأولى والثانية مزخرفتان بأسطر قصيرة متوسطة. */
export function isOpeningPage(page: number): boolean {
  return page <= 2;
}

export function isValidPage(data: unknown, page: number): data is Mushaf15Page {
  const d = data as Mushaf15Page | null;
  return !!d && d.p === page && Array.isArray(d.l) && d.l.length > 0;
}

/* ---------- التحميل (ذاكرة محدودة) ---------- */

/** أقصى عدد صفحات في الذاكرة: يكفي التقليب ذهاباً وإياباً دون نمو بلا حدّ على الأجهزة الضعيفة. */
const CACHE_MAX = 60;
const cache = new Map<number, Mushaf15Page>();
const inflight = new Map<number, Promise<Mushaf15Page>>();

function remember(page: number, data: Mushaf15Page) {
  cache.delete(page);
  cache.set(page, data);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as number);
}

export function getCachedPage(page: number): Mushaf15Page | undefined {
  const p = clampPage(page);
  const hit = cache.get(p);
  if (hit) remember(p, hit);
  return hit;
}

export function loadMushafPage(pageInput: number): Promise<Mushaf15Page> {
  const page = clampPage(pageInput);
  const hit = getCachedPage(page);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(page);
  if (pending) return pending;

  const p = (async () => {
    try {
      const res = await fetch(mushafPageUrl(page), { cache: "force-cache" });
      if (!res.ok) throw new Error(`mushaf15 page ${page}: HTTP ${res.status}`);
      const data: unknown = await res.json();
      if (!isValidPage(data, page)) throw new Error(`mushaf15 page ${page}: invalid file`);
      remember(page, data);
      return data;
    } finally {
      // يُحذف في كل الأحوال: الفشل لا يُحفظ، فتنجح إعادة المحاولة.
      inflight.delete(page);
    }
  })();
  inflight.set(page, p);
  return p;
}

/** الاسم القديم لـ`loadMushafPage` (خدمة الصفحات). */
export const loadMushaf15Page = loadMushafPage;

/** تسخين الصفحات المجاورة لتقليب فوري. */
export function prefetchPages(pages: number[]): void {
  for (const raw of pages) {
    if (raw < 1 || raw > MUSHAF_TOTAL_PAGES) continue;
    if (cache.has(raw) || inflight.has(raw)) continue;
    void loadMushafPage(raw).catch(() => undefined);
  }
}

/** الحزب (1..60) الساري في الصفحة. */
export function hizbOfPage(page: number): number {
  return hizbOf(page);
}

/** الجزء (1..30) الساري في الصفحة. */
export function juzOfPage(page: number): number {
  return juzOf(page);
}

/** أرقام السور التي لها آيات في الصفحة، بترتيبها (رأس سورة في آخر سطر لا يُحسب). */
export function surahsOnPage(data: Mushaf15Page): number[] {
  const out: number[] = [];
  for (const line of data.l) if (isAyahLine(line) && !out.includes(line.s)) out.push(line.s);
  return out;
}
