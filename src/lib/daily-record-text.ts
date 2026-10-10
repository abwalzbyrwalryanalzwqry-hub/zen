// نصوص المدى في السجل اليومي (للبطاقة واللوحة وملف الطالب).
import { t as tt } from "@/lib/i18n";
import { SURAHS } from "@/lib/quran-meta";
import {
  daySummary,
  isMember,
  segmentsToRange,
  type DaySheet,
  type QuranRange,
  type Segment,
} from "@/lib/daily-record";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

/** «الملك 1–10» أو «الملك 25 – القلم 5». */
export function rangeText(r: QuranRange | null): string {
  if (!r) return "";
  const a = SURAHS[r.fromSurah - 1]?.name ?? "";
  const b = SURAHS[r.toSurah - 1]?.name ?? "";
  return r.fromSurah === r.toSurah
    ? tt("dailyRecord.range.one", { surah: a, from: r.fromAyah, to: r.toAyah })
    : tt("dailyRecord.range.cross", { fromSurah: a, from: r.fromAyah, toSurah: b, to: r.toAyah });
}
export const segmentsText = (segs: readonly Segment[] | null | undefined) =>
  rangeText(segmentsToRange(segs));

/**
 * ملخص اليوم نصاً للمشاركة (DR-30): الحلقة واليوم، والأعداد، ثم سطر لكل طالب بحالته وإنجازه.
 * بلا أرقام هواتف ولا معرّفات؛ الأسماء كما تظهر في السجل.
 */
export function daySummaryText(sheet: DaySheet, dateLabel: string): string {
  const sum = daySummary(sheet.students);
  const sep = tt("dailyRecord.finish.listSep");
  const count = (k: keyof typeof sum) => `${tt(`dailyRecord.summary.${k}`)} ${sum[k]}`;
  const lines = [
    tt("dailyRecord.share.heading", { halaqa: sheet.halaqa.name, date: dateLabel }),
    (["present", "late", "absent", "excused", "unmarked"] as const).map(count).join(sep),
    (["memorized", "reviewed", "pages"] as const).map(count).join(sep),
    "",
  ];
  for (const s of sheet.students) {
    if (!isMember(s) && !s.status) continue;
    const parts = [
      s.status ? tt(`dailyRecord.attendance.${s.status}`) : tt("dailyRecord.summary.unmarked"),
      s.memorize &&
        `${tt("dailyRecord.card.memorizedToday")}: ${segmentsText(s.memorize.segments)}`,
      s.review && `${tt("dailyRecord.card.reviewedToday")}: ${segmentsText(s.review.segments)}`,
    ].filter(Boolean);
    lines.push(`${s.name}: ${parts.join(sep)}`);
  }
  return lines.join("\n").trim();
}
