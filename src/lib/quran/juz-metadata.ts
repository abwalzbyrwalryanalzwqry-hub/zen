// ============================================================
// Zen — Quran Data Layer
// Phase 8.4 — Juz & Hizb metadata (Madani Mushaf standard).
// ============================================================

import { HIZB_QUARTER_STARTS, SAJDAH_AYAHS } from "./structure-data";
import type { JuzMeta, HizbMeta } from "./types";

const JUZ_STARTS: { surah: number; ayah: number; page: number }[] = [
  { surah: 1, ayah: 1, page: 1 },
  { surah: 2, ayah: 142, page: 22 },
  { surah: 2, ayah: 253, page: 42 },
  { surah: 3, ayah: 93, page: 62 },
  { surah: 4, ayah: 24, page: 82 },
  { surah: 4, ayah: 148, page: 102 },
  { surah: 5, ayah: 82, page: 121 },
  { surah: 6, ayah: 111, page: 142 },
  { surah: 7, ayah: 88, page: 162 },
  { surah: 8, ayah: 41, page: 182 },
  { surah: 9, ayah: 93, page: 201 },
  { surah: 11, ayah: 6, page: 222 },
  { surah: 12, ayah: 53, page: 242 },
  { surah: 15, ayah: 1, page: 262 },
  { surah: 17, ayah: 1, page: 282 },
  { surah: 18, ayah: 75, page: 302 },
  { surah: 21, ayah: 1, page: 322 },
  { surah: 23, ayah: 1, page: 342 },
  { surah: 25, ayah: 21, page: 362 },
  { surah: 27, ayah: 56, page: 382 },
  { surah: 29, ayah: 46, page: 402 },
  { surah: 33, ayah: 31, page: 422 },
  { surah: 36, ayah: 28, page: 442 },
  { surah: 39, ayah: 32, page: 462 },
  { surah: 41, ayah: 47, page: 482 },
  { surah: 46, ayah: 1, page: 502 },
  { surah: 51, ayah: 31, page: 522 },
  { surah: 58, ayah: 1, page: 542 },
  { surah: 67, ayah: 1, page: 562 },
  { surah: 78, ayah: 1, page: 582 },
];

const JUZ_NAMES_AR = [
  "الأول",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
  "العاشر",
  "الحادي عشر",
  "الثاني عشر",
  "الثالث عشر",
  "الرابع عشر",
  "الخامس عشر",
  "السادس عشر",
  "السابع عشر",
  "الثامن عشر",
  "التاسع عشر",
  "العشرون",
  "الحادي والعشرون",
  "الثاني والعشرون",
  "الثالث والعشرون",
  "الرابع والعشرون",
  "الخامس والعشرون",
  "السادس والعشرون",
  "السابع والعشرون",
  "الثامن والعشرون",
  "التاسع والعشرون",
  "الثلاثون",
];

export const JUZ_META: readonly JuzMeta[] = JUZ_STARTS.map((j, i) => ({
  id: i + 1,
  nameAr: `الجزء ${JUZ_NAMES_AR[i]}`,
  start: { surah: j.surah, ayah: j.ayah },
  startPage: j.page,
}));

/**
 * الأحزاب الستون — بداية كل حزب هي الربع الأول منه في
 * `HIZB_QUARTER_STARTS` (مولَّدة من بيانات المصحف المدني).
 */
export const HIZB_META: readonly HizbMeta[] = Array.from({ length: 60 }, (_, i) => {
  const [surah, ayah, page] = HIZB_QUARTER_STARTS[i * 4];
  return {
    id: i + 1,
    juz: Math.floor(i / 2) + 1,
    start: { surah, ayah },
    startPage: page,
  };
});

export interface RubMeta {
  /** رقم الربع ١..٢٤٠. */
  id: number;
  hizb: number;
  /** موضعه داخل الحزب: ١ بداية الحزب، ٢ ربع، ٣ نصف، ٤ ثلاثة أرباع. */
  quarter: 1 | 2 | 3 | 4;
  start: { surah: number; ayah: number };
  startPage: number;
}

/** أرباع الأحزاب الـ ٢٤٠. */
export const RUB_META: readonly RubMeta[] = HIZB_QUARTER_STARTS.map(([surah, ayah, page], i) => ({
  id: i + 1,
  hizb: Math.floor(i / 4) + 1,
  quarter: ((i % 4) + 1) as RubMeta["quarter"],
  start: { surah, ayah },
  startPage: page,
}));

const rubStartKeys = new Map(RUB_META.map((r) => [`${r.start.surah}:${r.start.ayah}`, r]));
const sajdahKeys = new Set(SAJDAH_AYAHS.map(([s, a]) => `${s}:${a}`));

/** الربع الذي يبدأ عند هذه الآية، إن كانت بداية ربع. */
export function rubStartingAt(surah: number, ayah: number): RubMeta | undefined {
  return rubStartKeys.get(`${surah}:${ayah}`);
}

/** هل هذه الآية موضع سجدة تلاوة؟ */
export function isSajdahAyah(surah: number, ayah: number): boolean {
  return sajdahKeys.has(`${surah}:${ayah}`);
}
