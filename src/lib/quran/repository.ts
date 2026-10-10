// ============================================================
// Zen — Quran Data Layer
// Phase 8.4 — Repository / Service classes.
// ------------------------------------------------------------
// Single source of truth for every Quran-related screen.
// Screens must NOT import raw metadata arrays directly — they
// consume `quranRepository` (or the `useQuran*` hooks in the
// future) so the underlying data source can be swapped without
// touching UI code (bundled JSON, remote API, IndexedDB cache).
// ============================================================

import type { SurahMeta, JuzMeta, HizbMeta, RevelationType } from "./types";
import { SURAH_META } from "./metadata";
import { JUZ_META, HIZB_META } from "./juz-metadata";
import { normalizeArabic } from "./normalize";
import { SURAH_DETAILS, MOCK_SURAH_IDS, type SurahDetail } from "./mock-data";

/**
 * Read-only, in-memory repository backed by bundled metadata.
 * Async signatures are intentional — the same interface will be
 * reused when the source becomes a remote fetch or a WASM DB.
 */
export class QuranRepository {
  // -------- Surahs --------

  listSurahs(): readonly SurahMeta[] {
    return SURAH_META;
  }

  getSurah(id: number): SurahMeta | undefined {
    if (id < 1 || id > 114) return undefined;
    return SURAH_META[id - 1];
  }

  findSurahByName(query: string): SurahMeta[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const ar = normalizeArabic(q);
    return SURAH_META.filter(
      (s) =>
        (ar.length > 0 && normalizeArabic(s.nameAr).includes(ar)) ||
        s.nameEn.toLowerCase().includes(q) ||
        s.meaningEn.toLowerCase().includes(q),
    );
  }

  listSurahsByRevelation(type: RevelationType): SurahMeta[] {
    return SURAH_META.filter((s) => s.revelation === type);
  }

  // -------- Juz / Hizb --------

  listJuz(): readonly JuzMeta[] {
    return JUZ_META;
  }

  getJuz(id: number): JuzMeta | undefined {
    if (id < 1 || id > 30) return undefined;
    return JUZ_META[id - 1];
  }

  listHizb(): readonly HizbMeta[] {
    return HIZB_META;
  }

  getHizb(id: number): HizbMeta | undefined {
    if (id < 1 || id > 60) return undefined;
    return HIZB_META[id - 1];
  }

  // -------- Pages --------

  /** Resolve which Surah owns a given Mushaf page (1..604). */
  getSurahByPage(page: number): SurahMeta | undefined {
    return SURAH_META.find((s) => page >= s.pages.start && page <= s.pages.end);
  }

  // -------- Detail (mock) --------

  /** Returns extended detail if available (mocked for 3 Surahs). */
  getSurahDetail(id: number): SurahDetail | undefined {
    return SURAH_DETAILS[id];
  }

  hasDetail(id: number): boolean {
    return id in SURAH_DETAILS;
  }

  listMockedSurahs(): SurahDetail[] {
    return MOCK_SURAH_IDS.map((id) => SURAH_DETAILS[id]);
  }
}

/** Shared singleton — screens should import this. */
export const quranRepository = new QuranRepository();
