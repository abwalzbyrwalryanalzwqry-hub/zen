// ============================================================
// Zen — Quran Module
// Arabic word labels used on Mushaf page headers (as printed).
// ============================================================

/** الجزء الأول .. الجزء الثلاثون */
export const JUZ_NAMES_AR = [
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
] as const;

export function juzLabelAr(juz: number): string {
  const name = JUZ_NAMES_AR[Math.min(30, Math.max(1, juz)) - 1];
  return `الجزء ${name}`;
}

/** Strips the leading "سُورَةُ" that the dataset stores on Arabic names. */
export function bareSurahNameAr(nameAr: string): string {
  return nameAr.replace(/^سُورَةُ\s*/u, "").trim();
}
