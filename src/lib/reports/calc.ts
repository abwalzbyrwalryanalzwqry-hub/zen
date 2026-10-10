/**
 * محرّك حسابات التقارير (Report Calculation Engine) — المصدر الوحيد لكل رقم في سجل الإنجاز والمعاينة وPDF
 * وExcel وCSV. لا حساب داخل الواجهة.
 *
 * يعيد استعمال منطق السجل اليومي نفسه بدل نسخه: الحضور بـ isPresent وattendanceRate (center.ts)، والصفحات
 * بـ segmentsToRange/rangePages كما في ملخص اليوم (daySummary)، والدرجة 1..5 بـ scoreToGrade.
 */
import {
  EVAL_CRITERIA,
  isPresent,
  rangePages,
  scoreToGrade,
  segmentsToRange,
  type DayKind,
} from "@/lib/daily-record";
import { attendanceRate } from "@/lib/center";
import { addDays, daysBetween } from "@/lib/muhasaba/dates";
import { roundTo } from "./format";
import type { ReportData, ReportRow, ReportStudent, WorkLine } from "./types";

/* ─────────── أسطر العمل ─────────── */

export function workLine(row: ReportRow, kind: DayKind): WorkLine | null {
  const w = row[kind];
  if (!w || !w.segments?.length) return null;
  const range = segmentsToRange(w.segments);
  const ayahs = w.segments.reduce(
    (n, s) => n + Math.max(0, (s.to_ayah ?? 0) - (s.from_ayah ?? 0) + 1),
    0,
  );
  return {
    date: row.date,
    studentId: row.student_id,
    kind,
    segments: w.segments,
    range,
    pages: range ? rangePages(range) : 0,
    ayahs,
    grade: scoreToGrade(w.score),
    notes: w.notes,
  };
}

/** كل أسطر الحفظ والمراجعة بترتيب التاريخ ثم الطالب (كما يعيدها الخادم). */
export function workLines(
  rows: readonly ReportRow[],
  kinds: readonly DayKind[] = ["memorize", "review"],
) {
  const out: WorkLine[] = [];
  for (const r of rows)
    for (const k of kinds) {
      const l = workLine(r, k);
      if (l) out.push(l);
    }
  return out;
}

const avg = (xs: readonly number[]) =>
  xs.length ? roundTo(xs.reduce((a, b) => a + b, 0) / xs.length, 2) : null;

/* ─────────── إحصاء الطالب ─────────── */

export interface AttendanceStats {
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** أيام مسجّلة لهذا الطالب (بحالة). */
  marked: number;
  /** نسبة المواظبة 0..100 كما في لوحة المركز: (حاضر + متأخر) ÷ الأيام المسجّلة. */
  rate: number | null;
}

export interface WorkStats {
  sessions: number;
  pages: number;
  ayahs: number;
  avgGrade: number | null;
  first: WorkLine | null;
  last: WorkLine | null;
}

export type Trend = "up" | "down" | "steady";

export type FollowUpReason =
  | { kind: "absences"; n: number }
  | { kind: "lowAttendance"; pct: number }
  | { kind: "lowGrade"; avg: number }
  | { kind: "noMemorize"; days: number }
  | { kind: "noReview"; days: number }
  | { kind: "decline"; from: number; to: number };

export interface StudentStats {
  student: ReportStudent;
  attendance: AttendanceStats;
  memorize: WorkStats;
  review: WorkStats;
  /** متوسط كل الدرجات (حفظ ومراجعة) 1..5، وعددها. */
  avgGrade: number | null;
  graded: number;
  /** متوسط التقييم العام (معيار «overall») 1..5. */
  avgEvaluation: number | null;
  lastEvaluation: { date: string; value: number } | null;
  trend: Trend | null;
  notes: { date: string; text: string }[];
  followUp: FollowUpReason[];
}

/** حدود «يحتاج متابعة» (قواعد صريحة، والسبب يُكتب في التقرير). */
export const FOLLOW_UP = {
  absences: 3,
  lowAttendancePct: 75,
  minMarkedDays: 4,
  lowGrade: 2.5,
  idlePresentDays: 3,
  noReviewPresentDays: 5,
  declineBy: 0.5,
} as const;

function workStats(lines: readonly WorkLine[]): WorkStats {
  const graded = lines.filter((l) => l.grade != null).map((l) => l.grade as number);
  return {
    sessions: lines.length,
    pages: lines.reduce((n, l) => n + l.pages, 0),
    ayahs: lines.reduce((n, l) => n + l.ayahs, 0),
    avgGrade: avg(graded),
    first: lines[0] ?? null,
    last: lines[lines.length - 1] ?? null,
  };
}

/** اتجاه الأداء: متوسط درجات النصف الثاني من الفترة مقابل الأول (فرق 0.3 فأكثر). */
export function trendOf(lines: readonly WorkLine[], from: string, to: string): Trend | null {
  const graded = lines.filter((l) => l.grade != null);
  if (graded.length < 4) return null;
  const mid = addDays(from, Math.floor(daysBetween(from, to) / 2));
  const a = avg(graded.filter((l) => l.date <= mid).map((l) => l.grade as number));
  const b = avg(graded.filter((l) => l.date > mid).map((l) => l.grade as number));
  if (a == null || b == null) return null;
  if (b - a >= 0.3) return "up";
  if (a - b >= 0.3) return "down";
  return "steady";
}

export function studentStats(
  data: Pick<ReportData, "from" | "to" | "rows">,
  student: ReportStudent,
  prev?: StudentStats | null,
): StudentStats {
  const rows = data.rows.filter((r) => r.student_id === student.id);
  const att: AttendanceStats = {
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    marked: 0,
    rate: null,
  };
  for (const r of rows) if (r.status) att[r.status]++;
  att.marked = att.present + att.late + att.absent + att.excused;
  att.rate = attendanceRate(att);
  const mem = workLines(rows, ["memorize"]);
  const rev = workLines(rows, ["review"]);
  const all = [...mem, ...rev].sort((x, y) => x.date.localeCompare(y.date));
  const grades = all.filter((l) => l.grade != null).map((l) => l.grade as number);
  const evals = rows
    .filter((r) => r.evaluation?.overall != null)
    .map((r) => ({ date: r.date, value: r.evaluation?.overall as number }));
  const s: StudentStats = {
    student,
    attendance: att,
    memorize: workStats(mem),
    review: workStats(rev),
    avgGrade: avg(grades),
    graded: grades.length,
    avgEvaluation: avg(evals.map((e) => e.value)),
    lastEvaluation: evals[evals.length - 1] ?? null,
    trend: trendOf(all, data.from, data.to),
    notes: rows.filter((r) => r.note?.trim()).map((r) => ({ date: r.date, text: r.note!.trim() })),
    followUp: [],
  };
  s.followUp = followUpOf(s, prev ?? null);
  return s;
}

export function followUpOf(s: StudentStats, prev: StudentStats | null): FollowUpReason[] {
  const out: FollowUpReason[] = [];
  const a = s.attendance;
  const presentDays = a.present + a.late;
  if (a.absent >= FOLLOW_UP.absences) out.push({ kind: "absences", n: a.absent });
  if (a.rate != null && a.marked >= FOLLOW_UP.minMarkedDays && a.rate < FOLLOW_UP.lowAttendancePct)
    out.push({ kind: "lowAttendance", pct: a.rate });
  if (s.avgGrade != null && s.avgGrade <= FOLLOW_UP.lowGrade)
    out.push({ kind: "lowGrade", avg: s.avgGrade });
  if (presentDays >= FOLLOW_UP.idlePresentDays && s.memorize.sessions === 0)
    out.push({ kind: "noMemorize", days: presentDays });
  if (presentDays >= FOLLOW_UP.noReviewPresentDays && s.review.sessions === 0)
    out.push({ kind: "noReview", days: presentDays });
  if (
    prev?.avgGrade != null &&
    s.avgGrade != null &&
    prev.avgGrade - s.avgGrade >= FOLLOW_UP.declineBy
  )
    out.push({ kind: "decline", from: prev.avgGrade, to: s.avgGrade });
  return out;
}

/* ─────────── إجماليات الحلقة ─────────── */

export interface Totals {
  students: number;
  days: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number | null;
  memorizePages: number;
  memorizeSessions: number;
  reviewPages: number;
  reviewSessions: number;
  avgGrade: number | null;
  followUp: number;
}

export function totalsOf(stats: readonly StudentStats[], days: number): Totals {
  const sum = (f: (s: StudentStats) => number) => stats.reduce((n, s) => n + f(s), 0);
  const t: Totals = {
    students: stats.length,
    days,
    present: sum((s) => s.attendance.present),
    late: sum((s) => s.attendance.late),
    absent: sum((s) => s.attendance.absent),
    excused: sum((s) => s.attendance.excused),
    rate: null,
    memorizePages: sum((s) => s.memorize.pages),
    memorizeSessions: sum((s) => s.memorize.sessions),
    reviewPages: sum((s) => s.review.pages),
    reviewSessions: sum((s) => s.review.sessions),
    avgGrade: null,
    followUp: stats.filter((s) => s.followUp.length > 0).length,
  };
  t.rate = attendanceRate(t);
  // متوسط موزون بعدد الدرجات (لا متوسط المتوسطات).
  let n = 0;
  let total = 0;
  for (const s of stats)
    if (s.avgGrade != null && s.graded > 0) {
      n += s.graded;
      total += s.avgGrade * s.graded;
    }
  t.avgGrade = n ? roundTo(total / n, 2) : null;
  return t;
}

/* ─────────── المقارنة الزمنية ─────────── */

export type Direction = "up" | "down" | "same";
export interface Change {
  metric: "rate" | "memorizePages" | "reviewPages" | "avgGrade";
  prev: number | null;
  cur: number | null;
  dir: Direction | null;
}

/** الفترة السابقة بالطول نفسه، تنتهي قبل بداية الحالية بيوم. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const len = daysBetween(from, to);
  const pto = addDays(from, -1);
  return { from: addDays(pto, -len), to: pto };
}

export function compareTotals(cur: Totals, prev: Totals | null): Change[] {
  const metrics: Change["metric"][] = ["rate", "memorizePages", "reviewPages", "avgGrade"];
  return metrics.map((m) => {
    const c = cur[m];
    const p = prev ? prev[m] : null;
    const eps = m === "avgGrade" ? 0.05 : 0.5;
    const dir: Direction | null =
      c == null || p == null ? null : Math.abs(c - p) < eps ? "same" : c > p ? "up" : "down";
    return { metric: m, prev: p, cur: c, dir };
  });
}

/* ─────────── حالة الطالب للتصفية ─────────── */

export type StudentStatusFilter = "all" | "regular" | "followUp" | "lowAttendance" | "advanced";
export type GradeFilter = "all" | 5 | 4 | 3 | 2 | 1;
export type AchievementFilter = "all" | "hasAchievements" | "noProgress" | "stalled";

export function matchesStatus(s: StudentStats, f: StudentStatusFilter, t: Totals): boolean {
  if (f === "all") return true;
  if (f === "regular") return s.attendance.rate != null && s.attendance.rate >= 90;
  if (f === "followUp") return s.followUp.length > 0;
  if (f === "lowAttendance")
    return s.attendance.rate != null && s.attendance.rate < FOLLOW_UP.lowAttendancePct;
  const avgPages = t.students ? t.memorizePages / t.students : 0;
  return s.memorize.pages > avgPages && (s.avgGrade ?? 0) >= 4;
}

export function matchesGrade(s: StudentStats, f: GradeFilter): boolean {
  if (f === "all") return true;
  return s.avgGrade != null && Math.min(5, Math.max(1, Math.round(s.avgGrade))) === f;
}

/** أيام السجل في النطاق، وأيام الطالب التي حضر فيها (للمعاينة والتنبيهات). */
export const presentDays = (rows: readonly ReportRow[]) =>
  rows.filter((r) => isPresent(r.status)).length;

/** التقييم التفصيلي: متوسط كل معيار 1..5. */
export function evaluationAverages(rows: readonly ReportRow[]) {
  const out: Record<string, number | null> = {};
  for (const c of EVAL_CRITERIA)
    out[c] = avg(rows.map((r) => r.evaluation?.[c]).filter((v): v is number => v != null));
  return out;
}

/* ─────────── الترتيب ─────────── */

export type SortMode = "circle" | "nameAsc" | "nameDesc" | "topAchievement" | "lowAttendance";

export function sortStats(stats: readonly StudentStats[], mode: SortMode): StudentStats[] {
  const list = [...stats];
  const name = (s: StudentStats) => s.student.name;
  if (mode === "nameAsc") list.sort((a, b) => name(a).localeCompare(name(b), "ar"));
  else if (mode === "nameDesc") list.sort((a, b) => name(b).localeCompare(name(a), "ar"));
  else if (mode === "topAchievement")
    list.sort((a, b) => b.memorize.pages - a.memorize.pages || b.memorize.ayahs - a.memorize.ayahs);
  else if (mode === "lowAttendance")
    list.sort((a, b) => (a.attendance.rate ?? 101) - (b.attendance.rate ?? 101));
  return list;
}
