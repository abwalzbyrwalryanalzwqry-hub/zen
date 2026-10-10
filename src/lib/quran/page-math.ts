// ============================================================
// Zen — Quran Module
// حساب الصفحات من مصدر واحد: الجزء والحزب الساريان في الصفحة، وعدد آياتها،
// وهل تنتهي الصفحة مع نهاية سورة، وعلامات الأجزاء والأحزاب والأرباع والسجدات فيها.
// ------------------------------------------------------------
// كان الجزء يُحسب بطريقتين (أول آية في الصفحة، أو من الحزب) فاختلف القارئ عن
// السجل في الصفحات 62 و121 و201 و502. القاعدة الواحدة هنا: الجزء/الحزب الساري
// في الصفحة هو آخر ما بدأ فيها أو قبلها — كترويسة المصحف المطبوع ولوحة الحزب.
// ============================================================

import { HIZB_META, JUZ_META, RUB_META } from "./juz-metadata";
import { SURAH_META } from "./metadata";
import { PAGE_STARTS, SAJDAH_AYAHS } from "./structure-data";

export const PAGE_COUNT = 604;

function clamp(page: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(PAGE_COUNT, Math.max(1, Math.round(page)));
}

/* ---------- ترتيب الآيات في المصحف كله ---------- */

const OFFSETS: number[] = (() => {
  const out = [0, 0];
  let acc = 0;
  for (const s of SURAH_META) {
    acc += s.ayatCount;
    out.push(acc);
  }
  return out;
})();

/** ترتيب الآية في المصحف (١..٦٢٣٦). */
export function ayahOrdinal(surah: number, ayah: number): number {
  const s = Math.min(114, Math.max(1, Math.trunc(surah) || 1));
  const a = Math.min(SURAH_META[s - 1].ayatCount, Math.max(1, Math.trunc(ayah) || 1));
  return OFFSETS[s] + a;
}

/** عكس `ayahOrdinal`. */
export function ayahAtOrdinal(ordinal: number): { surah: number; ayah: number } {
  const n = Math.min(OFFSETS[115], Math.max(1, Math.trunc(ordinal) || 1));
  let s = 1;
  while (s < 114 && OFFSETS[s + 1] < n) s++;
  return { surah: s, ayah: n - OFFSETS[s] };
}

/* ---------- الصفحات ---------- */

/** عدد آيات الصفحة (ما يبدأ فيها من آيات). */
export function ayahsOnPage(pageInput: number): number {
  const page = clamp(pageInput);
  const [s, a] = PAGE_STARTS[page - 1];
  const first = ayahOrdinal(s, a);
  const next = page < PAGE_COUNT ? ayahOrdinal(PAGE_STARTS[page][0], PAGE_STARTS[page][1]) : 6237;
  return Math.max(0, next - first);
}

/** مجموع آيات صفحات (مع التكرار إن تكررت الصفحة). */
export function ayahsOnPages(pages: readonly number[]): number {
  let n = 0;
  for (const p of pages) n += ayahsOnPage(p);
  return n;
}

/**
 * هل تنتهي قراءة الصفحة الأخيرة من السورة بانتهاء السورة؟ لا، إن بدأت السورة التالية
 * في الصفحة نفسها (جزء عمّ خاصة): الصفحة لا تُعدّ مقروءة قبل قراءة ما بقي منها.
 */
export function surahEndsPage(surahId: number): boolean {
  if (surahId >= 114) return true;
  const meta = SURAH_META[surahId - 1];
  const next = SURAH_META[surahId];
  if (!meta || !next) return true;
  return next.pages.start !== meta.pages.end;
}

function latestStart(starts: readonly { startPage: number; id: number }[], page: number): number {
  let found = starts[0]?.id ?? 1;
  for (const x of starts) {
    if (x.startPage <= page) found = x.id;
    else break;
  }
  return found;
}

/** الجزء (١..٣٠) الساري في الصفحة: آخر جزء بدأ فيها أو قبلها. */
export function juzOfPage(pageInput: number): number {
  return latestStart(JUZ_META, clamp(pageInput));
}

/** الحزب (١..٦٠) الساري في الصفحة: آخر حزب بدأ فيها أو قبلها. */
export function hizbOfPage(pageInput: number): number {
  return latestStart(HIZB_META, clamp(pageInput));
}

/* ---------- علامات الهامش ---------- */

export type PageMarker =
  | { kind: "juz"; no: number; surah: number; ayah: number }
  | { kind: "hizb"; no: number; surah: number; ayah: number }
  | { kind: "rub"; hizb: number; quarter: 2 | 3 | 4; surah: number; ayah: number }
  | { kind: "sajdah"; surah: number; ayah: number };

const MARKERS_BY_PAGE: Map<number, PageMarker[]> = (() => {
  const map = new Map<number, PageMarker[]>();
  const push = (page: number, m: PageMarker) => {
    const list = map.get(page) ?? [];
    list.push(m);
    map.set(page, list);
  };
  const juzStarts = new Set(JUZ_META.map((j) => `${j.start.surah}:${j.start.ayah}`));
  for (const r of RUB_META) {
    const { surah, ayah } = r.start;
    if (r.quarter === 1) {
      const key = `${surah}:${ayah}`;
      if (juzStarts.has(key)) {
        push(r.startPage, { kind: "juz", no: Math.ceil(r.hizb / 2), surah, ayah });
      } else {
        push(r.startPage, { kind: "hizb", no: r.hizb, surah, ayah });
      }
    } else {
      push(r.startPage, { kind: "rub", hizb: r.hizb, quarter: r.quarter, surah, ayah });
    }
  }
  for (const [surah, ayah] of SAJDAH_AYAHS) {
    push(pageOf(surah, ayah), { kind: "sajdah", surah, ayah });
  }
  return map;
})();

/** صفحة الآية (بحث ثنائي في بدايات الصفحات). */
export function pageOf(surah: number, ayah: number): number {
  const target = ayahOrdinal(surah, ayah);
  let lo = 0;
  let hi = PAGE_STARTS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const [s, a] = PAGE_STARTS[mid];
    if (ayahOrdinal(s, a) <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** علامات الأجزاء والأحزاب والأرباع والسجدات التي تقع في الصفحة. */
export function markersOnPage(pageInput: number): readonly PageMarker[] {
  return MARKERS_BY_PAGE.get(clamp(pageInput)) ?? [];
}

/** علامة بداية جزء/حزب/ربع عند الآية، إن كانت. */
export function markerAtAyah(surah: number, ayah: number): PageMarker | undefined {
  return markersOnPage(pageOf(surah, ayah)).find(
    (m) => m.kind !== "sajdah" && m.surah === surah && m.ayah === ayah,
  );
}

const SAJDAH_KEYS = new Set(SAJDAH_AYAHS.map(([s, a]) => `${s}:${a}`));

/** هل الآية موضع سجدة تلاوة؟ */
export function isSajdah(surah: number, ayah: number): boolean {
  return SAJDAH_KEYS.has(`${surah}:${ayah}`);
}
