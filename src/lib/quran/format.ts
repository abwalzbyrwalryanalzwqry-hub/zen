// ============================================================
// Zen — Quran Data Layer
// Phase 8.4 — Formatting helpers (Arabic-Indic numerals, etc.)
// ============================================================

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/** Convert Western digits inside any value to Arabic-Indic. */
export function toArabicDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
}

/** e.g. "سورة الفاتحة" */
export function surahDisplayName(nameAr: string): string {
  return `سورة ${nameAr}`;
}

/** e.g. "١ - ٧" */
export function formatRangeAr(start: number, end: number): string {
  return start === end
    ? toArabicDigits(start)
    : `${toArabicDigits(start)} - ${toArabicDigits(end)}`;
}
