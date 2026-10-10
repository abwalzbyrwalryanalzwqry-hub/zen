// ============================================================
// Zen — Quran Data Layer
// Phase 8.6 — Text types (Uthmani script)
// ============================================================

/** A single Ayah in the Uthmani script. */
export interface AyahText {
  /** Ayah number within its Surah (1-based). */
  n: number;
  /** Uthmani script text (as authored by Tanzil.net). */
  t: string;
  /** Mushaf page (1..604). */
  p: number;
  /** Juz (1..30). */
  j: number;
}

/** Full text payload for one Surah. */
export interface SurahText {
  id: number;
  nameAr: string;
  nameEn: string;
  count: number;
  ayahs: AyahText[];
}

/** Dataset manifest. */
export interface QuranIndex {
  edition: string;
  source: string;
  surahs: { id: number; count: number }[];
}
