// ============================================================
// Zen — Quran Data Layer
// Phase 8.7 — Mushaf page service (604-page Madani Mushaf)
// ------------------------------------------------------------
// Builds a page payload by composing the existing text service
// (per-Surah Uthmani JSON, already cached) with the page metadata
// carried on every Ayah (`p`) and the Surah page ranges.
// No new dataset, no images.
// ============================================================

import { hasBasmalaHeader } from "./basmala";
import { SURAH_META } from "./metadata";
import { PAGE_STARTS } from "./structure-data";
import { clampPage as clampMushafPage, loadMushaf15Page, type Mushaf15Page } from "./mushaf15";
import { hizbOfPage, juzOfPage } from "./page-math";
import { quranTextService } from "./text-service";
import type { AyahText } from "./text-types";

export const MUSHAF_PAGE_COUNT = 604;

export { BASMALA } from "./basmala";

export interface MushafSegment {
  surahId: number;
  nameAr: string;
  nameEn: string;
  /** True when this page contains the Surah's first Ayah. */
  startsSurah: boolean;
  /** Render the decorative Basmala above the verses. */
  showBasmala: boolean;
  ayahs: AyahText[];
}

export interface MushafPage {
  page: number;
  juz: number;
  hizb: number | undefined;
  segments: MushafSegment[];
  /** تخطيط الأسطر الخمسة عشر كما في المطبوع. */
  layout: Mushaf15Page;
}

/** تقييد رقم الصفحة إلى ١..٦٠٤ (التنفيذ الوحيد في `mushaf15`). */
export const clampPage = clampMushafPage;

/**
 * السور الظاهرة في الصفحة، مشتقّة من أول آية في الصفحة وأول آية في
 * التي تليها (لا من نطاقات الصفحات المكتوبة يدوياً).
 */
export function surahIdsOnPage(pageInput: number): number[] {
  const page = clampPage(pageInput);
  const [first] = PAGE_STARTS[page - 1];
  let last = 114;
  if (page < MUSHAF_PAGE_COUNT) {
    const [nextSurah, nextAyah] = PAGE_STARTS[page];
    last = nextAyah === 1 ? nextSurah - 1 : nextSurah;
  }
  const ids: number[] = [];
  for (let id = first; id <= Math.max(first, last); id++) ids.push(id);
  return ids;
}

/** Hizb (1..60) that is in effect at the given page (shared rule in `page-math`). */
export function hizbForPage(page: number): number | undefined {
  return hizbOfPage(page);
}

/** أقصى عدد صفحات مركّبة في الذاكرة (LRU). */
const PAGE_CACHE_MAX = 40;
const pageCache = new Map<number, MushafPage>();

function rememberPage(page: number, value: MushafPage) {
  pageCache.delete(page);
  pageCache.set(page, value);
  while (pageCache.size > PAGE_CACHE_MAX) pageCache.delete(pageCache.keys().next().value as number);
}
const inflight = new Map<number, Promise<MushafPage>>();

export class QuranPageService {
  async loadPage(pageInput: number): Promise<MushafPage> {
    const page = clampPage(pageInput);
    const cached = pageCache.get(page);
    if (cached) return cached;
    const pending = inflight.get(page);
    if (pending) return pending;

    const p = (async () => {
      try {
        const ids = surahIdsOnPage(page);
        const [layout, ...texts] = await Promise.all([
          loadMushaf15Page(page),
          ...ids.map((id) => quranTextService.loadSurah(id)),
        ]);

        const segments: MushafSegment[] = [];
        for (const text of texts) {
          const meta = SURAH_META[text.id - 1];
          const ayahs = text.ayahs.filter((a) => a.p === page);
          if (ayahs.length === 0) continue;

          const startsSurah = ayahs[0].n === 1;
          let showBasmala = false;
          // البسملة فُصلت عن الآية الأولى في خدمة النص.
          if (startsSurah && hasBasmalaHeader(text.id)) showBasmala = true;

          segments.push({
            surahId: text.id,
            nameAr: meta.nameAr,
            nameEn: meta.nameEn,
            startsSurah,
            showBasmala,
            ayahs,
          });
        }

        // الجزء الساري في الصفحة بالقاعدة نفسها في كل الشاشات (آخر جزء بدأ فيها أو قبلها).
        const result: MushafPage = {
          page,
          juz: juzOfPage(page),
          hizb: hizbForPage(page),
          segments,
          layout,
        };
        rememberPage(page, result);
        return result;
      } finally {
        // يُحذف في كل الأحوال: الفشل لا يُحفظ، فتنجح إعادة المحاولة.
        inflight.delete(page);
      }
    })();

    inflight.set(page, p);
    return p;
  }

  getCached(pageInput: number): MushafPage | undefined {
    const page = clampPage(pageInput);
    const hit = pageCache.get(page);
    if (hit) rememberPage(page, hit);
    return hit;
  }

  /** Warm neighbouring pages for instant swipes. */
  prefetch(pages: number[]): void {
    for (const raw of pages) {
      if (raw < 1 || raw > MUSHAF_PAGE_COUNT) continue;
      const page = clampPage(raw);
      if (pageCache.has(page) || inflight.has(page)) continue;
      void this.loadPage(page).catch(() => {
        /* silent */
      });
    }
  }
}

export const quranPageService = new QuranPageService();
