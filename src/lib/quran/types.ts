// ============================================================
// Zen — Quran Data Layer
// Phase 8.4 — Types
// ------------------------------------------------------------
// Central TypeScript contracts for every Quran-related screen.
// Text (verses) is intentionally NOT part of these types yet.
// A later phase will add `AyahText`, `TafsirEntry`, etc.
// ============================================================

/** Revelation location of a Surah. */
export type RevelationType = "makki" | "madani";

/** Arabic label matching a `RevelationType`. */
export const REVELATION_LABEL_AR: Record<RevelationType, "مكية" | "مدنية"> = {
  makki: "مكية",
  madani: "مدنية",
};

/** Inclusive numeric range (Juz, Hizb, Page, ...). */
export type NumericRange = {
  start: number;
  end: number;
};

/**
 * Full metadata for one of the 114 Surahs.
 * Page numbers follow the standard Madani Mushaf (604 pages).
 */
export interface SurahMeta {
  /** 1..114 */
  id: number;
  /** Arabic name (with ال when applicable) — e.g. "الفاتحة". */
  nameAr: string;
  /** Transliterated English name — e.g. "Al-Fatihah". */
  nameEn: string;
  /** English meaning / translation — e.g. "The Opener". */
  meaningEn: string;
  /** Makki or Madani. */
  revelation: RevelationType;
  /** Total number of Ayat in the Surah. */
  ayatCount: number;
  /** Inclusive Juz range (1..30). */
  juz: NumericRange;
  /** Inclusive Hizb range (1..60). */
  hizb: NumericRange;
  /** Inclusive Mushaf page range (1..604). */
  pages: NumericRange;
  /** Global order of revelation (1..114). */
  revelationOrder: number;
}

/** A Juz (Para) in the Mushaf — 30 total. */
export interface JuzMeta {
  id: number; // 1..30
  nameAr: string; // e.g. "الجزء الأول"
  /** Where this Juz begins (surah + ayah). */
  start: { surah: number; ayah: number };
  /** First Mushaf page of the Juz. */
  startPage: number;
}

/** A Hizb — 60 total (2 per Juz). */
export interface HizbMeta {
  id: number; // 1..60
  juz: number; // 1..30
  start: { surah: number; ayah: number };
  startPage: number;
}

/**
 * Placeholder for future verse content.
 * NOT populated in Phase 8.4 — kept here so downstream
 * screens can already type against the final shape.
 */
export interface AyahRef {
  surah: number;
  ayah: number;
  juz: number;
  hizb: number;
  page: number;
}
