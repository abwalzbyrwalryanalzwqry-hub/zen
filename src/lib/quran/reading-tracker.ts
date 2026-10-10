// ============================================================
// Zen — Quran Module
// تتبع القراءة الفعلية: متى تُعدّ الصفحة «مقروءة»، وأين يقف القارئ.
// يُستعمل في وضعَي السورة والمصحف فيغذّي سجل القراءة والختمة معاً.
// ============================================================

import { JUZ_META } from "./juz-metadata";
import { PAGE_STARTS } from "./structure-data";
import { markPagesRead } from "./reading-history";
import { recordPagesRead } from "./khatmah-plan";

export { surahEndsPage } from "./page-math";

/** أقل مدة مكوث على الصفحة لتُعدّ مقروءة (التقليب السريع تصفّح لا قراءة). */
export const MIN_PAGE_DWELL_MS = 10_000;

/** أول آية في صفحة المصحف (١..٦٠٤). */
export function pageStart(page: number): { surah: number; ayah: number } {
  const p = Math.min(604, Math.max(1, Math.trunc(page) || 1));
  const [surah, ayah] = PAGE_STARTS[p - 1];
  return { surah, ayah };
}

/** صفحة المصحف (١..٦٠٤) التي تقع فيها الآية. */
export function pageOfAyah(surah: number, ayah: number): number {
  let lo = 0;
  let hi = PAGE_STARTS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const [s, a] = PAGE_STARTS[mid];
    if (s < surah || (s === surah && a <= ayah)) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** الجزء الذي تقع فيه الآية. */
export function juzOf(surah: number, ayah: number): number {
  let juz = 1;
  for (const j of JUZ_META) {
    const { surah: s, ayah: a } = j.start;
    if (s < surah || (s === surah && a <= ayah)) juz = j.id;
    else break;
  }
  return juz;
}

/**
 * يتتبع انتقال القارئ بين الصفحات: الصفحة تُعدّ مقروءة حين ينتقل منها إلى
 * التالية مباشرة بعد مكوث كافٍ، أو حين يُنهيها (آخر السورة / آخر المصحف).
 * القفزات والرجوع للخلف لا تُحتسب.
 */
export class PageDwellTracker {
  private page: number | null = null;
  private enteredAt = 0;
  private done = new Set<number>();

  constructor(private readonly minDwellMs = MIN_PAGE_DWELL_MS) {}

  /** يُستدعى كلما تغيّرت الصفحة الظاهرة. يعيد الصفحات التي اكتملت قراءتها. */
  visit(page: number, now: number): number[] {
    if (page === this.page) return [];
    const prev = this.page;
    const dwelt = now - this.enteredAt >= this.minDwellMs;
    this.page = page;
    this.enteredAt = now;
    if (prev !== null && page === prev + 1 && dwelt) return this.take(prev);
    return [];
  }

  /** وصل القارئ إلى نهاية ما يقرأ على الصفحة الحالية. */
  finish(now: number): number[] {
    if (this.page === null || now - this.enteredAt < this.minDwellMs) return [];
    return this.take(this.page);
  }

  reset(): void {
    this.page = null;
    this.enteredAt = 0;
    this.done.clear();
  }

  private take(page: number): number[] {
    if (this.done.has(page)) return [];
    this.done.add(page);
    return [page];
  }
}

/** يسجّل صفحات مقروءة في السجل (نسبة الختمة العامة) وفي الختمة المخطّطة. */
export function notePagesRead(pages: number[]): void {
  if (!pages.length) return;
  markPagesRead(pages);
  recordPagesRead(pages);
}
