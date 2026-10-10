/**
 * محرّك التحقق قبل إنشاء التقرير (Report Validation Engine). لا يُفشل التقرير بنقص بسيط (سجل بلا ملاحظة)،
 * لكنه يحصي ما يحتاج مراجعة ويُظهره قبل الاستخراج وفي التقرير نفسه، فلا تقرير مضلِّل بلا تنبيه.
 */
import { SURAHS } from "@/lib/quran-meta";
import { isPresent, surahNo } from "@/lib/daily-record";
import type { ReportData, ReportRow } from "./types";

export type IssueKind =
  | "badRange"
  | "unknownStudent"
  | "badSurah"
  | "badAyah"
  | "badGrade"
  | "badEvaluation"
  | "workWhileAway"
  | "workWithoutGrade"
  | "badDate";

/** error: بيانات تالفة تُستبعد من الحساب. warning: تُحسب لكن تستحق المراجعة. */
export type Severity = "error" | "warning";

export interface Issue {
  kind: IssueKind;
  severity: Severity;
  date?: string;
  studentId?: string;
  detail?: string;
}

const SEVERITY: Record<IssueKind, Severity> = {
  badRange: "error",
  unknownStudent: "error",
  badSurah: "error",
  badAyah: "error",
  badGrade: "error",
  badEvaluation: "error",
  badDate: "error",
  workWhileAway: "warning",
  workWithoutGrade: "warning",
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function checkRow(r: ReportRow, known: Set<string>, from: string, to: string, out: Issue[]) {
  const add = (kind: IssueKind, detail?: string) =>
    out.push({ kind, severity: SEVERITY[kind], date: r.date, studentId: r.student_id, detail });
  if (!DAY.test(r.date) || r.date < from || r.date > to) add("badDate");
  if (!known.has(r.student_id)) add("unknownStudent");
  for (const kind of ["memorize", "review"] as const) {
    const w = r[kind];
    if (!w) continue;
    for (const s of w.segments ?? []) {
      const n = surahNo(s.surah_name);
      if (!n) {
        add("badSurah", s.surah_name);
        continue;
      }
      const max = SURAHS[n - 1].ayahs;
      if (
        !Number.isInteger(s.from_ayah) ||
        !Number.isInteger(s.to_ayah) ||
        s.from_ayah < 1 ||
        s.to_ayah > max ||
        s.from_ayah > s.to_ayah
      )
        add("badAyah", `${s.surah_name} ${s.from_ayah}-${s.to_ayah}`);
    }
    if (w.score != null && (w.score < 0 || w.score > 100)) add("badGrade", String(w.score));
    if (w.score == null) add("workWithoutGrade", kind);
    if (r.status && !isPresent(r.status)) add("workWhileAway", kind);
  }
  for (const v of Object.values(r.evaluation ?? {}))
    if (v != null && (!Number.isInteger(v) || v < 1 || v > 5)) add("badEvaluation", String(v));
}

export function validateReport(data: ReportData): Issue[] {
  const out: Issue[] = [];
  if (!DAY.test(data.from) || !DAY.test(data.to) || data.from > data.to)
    out.push({ kind: "badRange", severity: "error" });
  const known = new Set(data.students.map((s) => s.id));
  for (const r of data.rows) checkRow(r, known, data.from, data.to, out);
  return out;
}

/** هل يُستبعد السطر من الحسابات (مقطع تالف أو طالب غير معروف)؟ */
export function isCorrupt(issues: readonly Issue[], r: Pick<ReportRow, "date" | "student_id">) {
  return issues.some(
    (i) =>
      i.severity === "error" &&
      i.date === r.date &&
      i.studentId === r.student_id &&
      i.kind !== "badEvaluation",
  );
}

/** يزيل الأجزاء التالفة فقط: المقطع الخاطئ يُحذف والسطر يبقى بحضوره وملاحظته. */
export function sanitize(data: ReportData): ReportData {
  const known = new Set(data.students.map((s) => s.id));
  const okSeg = (s: { surah_name: string; from_ayah: number; to_ayah: number }) => {
    const n = surahNo(s.surah_name);
    return (
      !!n &&
      Number.isInteger(s.from_ayah) &&
      Number.isInteger(s.to_ayah) &&
      s.from_ayah >= 1 &&
      s.from_ayah <= s.to_ayah &&
      s.to_ayah <= SURAHS[n - 1].ayahs
    );
  };
  const work = (w: ReportRow["memorize"]) => {
    if (!w) return null;
    const segments = (w.segments ?? []).filter(okSeg);
    if (!segments.length) return null;
    const score = w.score != null && w.score >= 0 && w.score <= 100 ? w.score : null;
    return { ...w, segments, score };
  };
  return {
    ...data,
    rows: data.rows
      .filter((r) => known.has(r.student_id) && DAY.test(r.date))
      .map((r) => ({ ...r, memorize: work(r.memorize), review: work(r.review) })),
  };
}
