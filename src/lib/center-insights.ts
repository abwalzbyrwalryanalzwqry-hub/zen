/**
 * لوحة المدير والتفاعل (1.20.0، المرحلة 4 من خطة التطوير؛ supabase/migrations/20261210100000_center_insights.sql):
 * الفترة والمقارنة، والتعمّق في المؤشر، وجودة الإدخال لكل معلّم، ودوري الحلقات، وإعدادات المركز لها.
 * القراءة عبر دوال الخادم التي تتحقق من الصلاحية (can_view_center)؛ والمنطق الصافي هنا مختبَر في
 * center-insights.test.ts.
 */
import { rpc } from "@/integrations/supabase/rpc";
import { t } from "@/lib/i18n";

export type WindowStats = {
  from: string;
  to: string;
  students: number;
  active_students: number;
  attendance_records: number;
  attendance_rate: number | null;
  pages_memorized: number;
  assessments: number;
  avg_score: number | null;
  exams: number;
  avg_exam: number | null;
  records: number;
  same_day_rate: number | null;
  edits_after_close: number;
};
export type PeriodCompare = { days: number; current: WindowStats; previous: WindowStats };

export type DrillStudent = {
  student_id: string;
  name: string;
  halaqat: string | null;
  halaqa_id: string | null;
  attendance_total: number;
  absent: number;
  attendance_rate: number | null;
  pages: number;
  assessments: number;
  avg_score: number | null;
  avg_exam: number | null;
  last_activity: string | null;
};
export type Drilldown = { days: number; students: DrillStudent[] };

export type TeacherQuality = {
  teacher_id: string;
  name: string;
  halaqat: number;
  records: number;
  closed: number;
  same_day: number;
  same_day_rate: number | null;
  late_closes: number;
  edits_after_close: number;
  warnings: number;
  reviewed: number;
  flagged: number;
};
export type TeacherQualityReport = { center_id: string; days: number; teachers: TeacherQuality[] };

export type LeagueItem = {
  halaqa_id: string;
  name: string;
  students: number;
  mine: boolean;
  regularity: number | null;
  avg_score: number | null;
  challenges: number | null;
  index: number | null;
  index_prev: number | null;
  change: number | null;
  rank: number;
};
export type League = { center_id: string; enabled: boolean; days: number; items: LeagueItem[] };

function unwrap<T>(r: { data: unknown; error: unknown }, key: "load" | "save"): T {
  if (r.error) throw new Error(t(`centerInsights.err.${key}`));
  return r.data as T;
}

export const fetchPeriodCompare = async (centerId: string, days: number) =>
  unwrap<PeriodCompare>(
    await rpc("center_period_compare", { _center: centerId, _days: days }),
    "load",
  );
export const fetchDrilldown = async (centerId: string, days: number) =>
  unwrap<Drilldown>(await rpc("center_drilldown", { _center: centerId, _days: days }), "load");
export const fetchTeacherQuality = async (centerId: string, days: number) =>
  unwrap<TeacherQualityReport>(
    await rpc("center_teacher_quality", { _center: centerId, _days: days }),
    "load",
  );
export const fetchLeague = async (centerId: string, days = 30) =>
  unwrap<League>(await rpc("center_halaqa_league", { _center: centerId, _days: days }), "load");
export const setLeagueEnabled = async (centerId: string, on: boolean) =>
  void unwrap<null>(await rpc("set_center_halaqa_league", { _center: centerId, _on: on }), "save");
export const setWeeklySummary = async (centerId: string, on: boolean) =>
  void unwrap<null>(await rpc("set_center_weekly_summary", { _center: centerId, _on: on }), "save");

// ─────────── التغيّر بين الفترتين ───────────

export type Trend = "up" | "down" | "flat";
export type Delta = {
  trend: Trend;
  /** الفرق المطلق (نقاط مئوية للنِّسب). */
  diff: number;
  /** نسبة التغيّر للأعداد (null للنِّسب أو حين تكون السابقة صفراً). */
  pct: number | null;
  /** هل الارتفاع تحسّن؟ (false لمؤشر «يحتاجون متابعة» مثلاً). */
  good: boolean | null;
};

/**
 * التغيّر من السابقة إلى الحالية. `kind = "rate"` للنِّسب المئوية: الفرق بالنقاط بلا نسبة تغيّر.
 * `higherIsBetter = false` يقلب معنى السهم (اللون) لا اتجاهه. null حين ينقص أحد الطرفين.
 */
export function delta(
  current: number | null | undefined,
  previous: number | null | undefined,
  kind: "count" | "rate" = "count",
  higherIsBetter = true,
): Delta | null {
  if (current == null || previous == null) return null;
  const diff = current - previous;
  const trend: Trend = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const pct = kind === "rate" || previous === 0 ? null : Math.round((diff / previous) * 100);
  const good = trend === "flat" ? null : (trend === "up") === higherIsBetter;
  return { trend, diff, pct, good };
}

/** «↑ 12%» أو «↓ 3 نقاط» أو «= بلا تغيّر». */
export function deltaLabel(d: Delta, kind: "count" | "rate" = "count"): string {
  if (d.trend === "flat") return t("centerInsights.delta.flat");
  const arrow = d.trend === "up" ? "↑" : "↓";
  const n = Math.abs(d.diff);
  if (kind === "rate") return `${arrow} ${t("centerInsights.delta.points", { n })}`;
  return d.pct == null ? `${arrow} ${n}` : `${arrow} ${Math.abs(d.pct)}%`;
}

// ─────────── التعمّق ───────────

export type DrillMetric = "students" | "attendance" | "pages" | "score" | "assessments" | "exam";

const byName = (a: DrillStudent, b: DrillStudent) => a.name.localeCompare(b.name, "ar");
/** القيم الفارغة آخر القائمة دائماً. */
function nullsLast(a: number | null, b: number | null, dir: 1 | -1, tie: () => number): number {
  if (a == null && b == null) return tie();
  if (a == null) return 1;
  if (b == null) return -1;
  return a === b ? tie() : (a - b) * dir;
}

/**
 * ما وراء المؤشر: الطلاب مرتّبين بما يفسّره (الأقل حضوراً أولاً لنسبة الحضور، والأكثر حفظاً للصفحات، والأضعف
 * تسميعاً لمتوسط التسميع…). «students» بالاسم.
 */
export function drillRows(rows: DrillStudent[], metric: DrillMetric): DrillStudent[] {
  const out = [...rows];
  switch (metric) {
    case "attendance":
      return out
        .filter((r) => r.attendance_total > 0)
        .sort((a, b) => nullsLast(a.attendance_rate, b.attendance_rate, 1, () => byName(a, b)));
    case "pages":
      return out.sort((a, b) => b.pages - a.pages || byName(a, b));
    case "score":
      return out
        .filter((r) => r.avg_score != null)
        .sort((a, b) => nullsLast(a.avg_score, b.avg_score, 1, () => byName(a, b)));
    case "assessments":
      return out.sort((a, b) => b.assessments - a.assessments || byName(a, b));
    case "exam":
      return out
        .filter((r) => r.avg_exam != null)
        .sort((a, b) => nullsLast(a.avg_exam, b.avg_exam, 1, () => byName(a, b)));
    default:
      return out.sort(byName);
  }
}

/** القيمة المعروضة بجانب الطالب في قائمة المؤشر. */
export function drillValue(r: DrillStudent, metric: DrillMetric): string {
  switch (metric) {
    case "attendance":
      return r.attendance_rate == null ? "—" : `${r.attendance_rate}%`;
    case "pages":
      return String(r.pages);
    case "score":
      return r.avg_score == null ? "—" : String(r.avg_score);
    case "assessments":
      return String(r.assessments);
    case "exam":
      return r.avg_exam == null ? "—" : `${r.avg_exam}%`;
    default:
      return r.attendance_rate == null ? "—" : `${r.attendance_rate}%`;
  }
}

// ─────────── جودة الإدخال ───────────

/** «تحتاج انتباهاً» حين يقلّ الإغلاق في اليوم نفسه عن 70% أو تكثر التعديلات أو التنبيهات. للمتابعة لا للحكم. */
export function needsAttention(q: TeacherQuality): boolean {
  if (q.records === 0) return false;
  return (
    (q.same_day_rate != null && q.same_day_rate < 70) ||
    q.edits_after_close >= 5 ||
    q.warnings >= 3 ||
    q.flagged > 0
  );
}

export type MyLeague = League & { center_name: string };
export const fetchMyLeagues = async (days = 30) =>
  unwrap<MyLeague[]>(await rpc("my_halaqa_leagues", { _days: days }), "load") ?? [];
