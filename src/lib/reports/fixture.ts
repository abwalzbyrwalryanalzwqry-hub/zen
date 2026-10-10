/**
 * بيانات اختبار للتقارير بأسماء عربية حقيقية الشكل وسور طويلة وقصيرة (اختبارات الوحدة وe2e). ليست بيانات
 * تطبيق: لا يستوردها كود الإنتاج.
 */
import { addDays } from "@/lib/muhasaba/dates";
import type { ReportData, ReportRow } from "./types";

export const STUDENTS = [
  { id: "s1", name: "عبدالرحمن أحمد نعمان", member: true },
  { id: "s2", name: "إسماعيل مختار البدر", member: true },
  { id: "s3", name: "موسى محمد عبدالرؤوف", member: true },
];

const seg = (surah_name: string, from_ayah: number, to_ayah: number) => ({
  surah_name,
  from_ayah,
  to_ayah,
});
const work = (segs: ReturnType<typeof seg>[], score: number | null) => ({
  segments: segs,
  score,
  error_type: null,
  notes: null,
});

/** عشرة أيام من 1 سبتمبر 2026: الأول منتظم يحفظ البقرة، والثاني يحفظ يس ثم النبإ، والثالث يكثر غيابه. */
export function fixture(over: Partial<ReportData> = {}): ReportData {
  const from = "2026-09-01";
  const rows: ReportRow[] = [];
  for (let i = 0; i < 10; i++) {
    const date = addDays(from, i);
    rows.push({
      date,
      student_id: "s1",
      status: i === 4 ? "late" : "present",
      reason: null,
      note: i === 9 ? "ممتاز في التجويد" : null,
      evaluation: { overall: 4 + (i % 2), tajweed: 4, pronunciation: 5, behavior: 5 },
      memorize: work([seg("البقرة", i * 10 + 1, i * 10 + 10)], 90 + (i % 2) * 6),
      review: i % 3 === 0 ? work([seg("آل عمران", 1, 20)], 88) : null,
    });
    rows.push({
      date,
      student_id: "s2",
      status: i === 2 ? "excused" : "present",
      reason: i === 2 ? "سفر" : null,
      note: null,
      evaluation: { overall: 3 },
      memorize:
        i < 5
          ? work([seg("يس", i * 17 + 1, Math.min(83, i * 17 + 17))], 80)
          : i === 5
            ? work([seg("النبإ", 1, 40)], 72)
            : null,
      review: i > 5 ? work([seg("يس", 1, 30)], 75) : null,
    });
    rows.push({
      date,
      student_id: "s3",
      status: i % 2 ? "absent" : "present",
      reason: null,
      note: null,
      evaluation: null,
      memorize: null,
      review: null,
    });
  }
  const history = rows
    .filter((r) => r.memorize)
    .flatMap((r) =>
      r.memorize!.segments.map((s) => ({ ...s, student_id: r.student_id, date: r.date })),
    );
  return {
    halaqa: {
      id: "h1",
      name: "حلقة الفجر",
      teacher_name: "أحمد علي",
      center_name: "مركز النور",
    },
    from,
    to: "2026-09-10",
    today: "2026-09-10",
    generated_at: "2026-09-10T10:00:00Z",
    schedule: [
      { weekday: 0, start: "16:00:00", end: "18:00:00" },
      { weekday: 2, start: "16:00:00", end: "18:00:00" },
    ],
    students: STUDENTS,
    days: Array.from({ length: 10 }, (_, i) => ({
      date: addDays(from, i),
      status: "completed" as const,
      notes: null,
    })),
    rows,
    history,
    ...over,
  };
}
