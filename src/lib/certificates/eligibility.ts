/**
 * شروط استحقاق أنواع الشهادات: سجلّ قابل للتوسعة (نوع شرط جديد = مدخل جديد هنا، والنوع في قاعدة البيانات
 * يشير إليه بالاسم). القيم من محرّك سجل الإنجاز نفسه (StudentReport من src/lib/reports/compute) — لا حساب
 * إنجاز مستقل. نوع بلا شروط يصدره المخوَّل يدوياً.
 */
import type { StudentReport } from "@/lib/reports/compute";
import { TOTAL_AYAHS, surahMap } from "@/lib/reports/achieve";

export type ConditionKind =
  | "memorizedPages"
  | "reviewPages"
  | "attendanceRate"
  | "attendedDays"
  | "evaluationAverage"
  | "gradeAverage"
  | "surahComplete"
  | "juzComplete"
  | "khatm";

export interface Condition {
  kind: ConditionKind | string;
  gte?: number;
  minDays?: number;
}

/** مرجع الإنجاز المحدد (سورة أو جزء) لأنواع «إتمام سورة/جزء». */
export type AchievementRef =
  | { kind: "surah"; surah: number }
  | { kind: "juz"; juz: number }
  | { kind: "course"; title: string }
  | { kind: "milestone"; text: string }
  | null;

export interface CheckResult {
  kind: string;
  ok: boolean;
  /** القيمة الفعلية من السجل (للعرض في الفحص). */
  actual: number | null;
  need: number | null;
}

export interface Eligibility {
  eligible: boolean;
  manual: boolean;
  checks: CheckResult[];
}

type Evaluator = (c: Condition, r: StudentReport, ref: AchievementRef) => CheckResult;

const num = (c: Condition, kind: string, actual: number | null): CheckResult => ({
  kind,
  actual,
  need: c.gte ?? null,
  ok: actual != null && actual >= (c.gte ?? 0),
});

export const EVALUATORS: Record<ConditionKind, Evaluator> = {
  memorizedPages: (c, r) => num(c, c.kind, r.stats.memorize.pages),
  reviewPages: (c, r) => num(c, c.kind, r.stats.review.pages),
  attendanceRate: (c, r) => {
    const a = r.stats.attendance;
    const res = num(c, c.kind, a.rate);
    return { ...res, ok: res.ok && a.marked >= (c.minDays ?? 0) };
  },
  attendedDays: (c, r) => num(c, c.kind, r.stats.attendance.present + r.stats.attendance.late),
  evaluationAverage: (c, r) => num(c, c.kind, r.stats.avgEvaluation),
  gradeAverage: (c, r) => num(c, c.kind, r.stats.avgGrade),
  surahComplete: (c, r, ref) => {
    if (ref?.kind !== "surah") return { kind: c.kind, ok: false, actual: null, need: null };
    const p = surahMap(r.journey.coverage)[ref.surah - 1];
    return {
      kind: c.kind,
      ok: p?.state === "done",
      actual: p ? Math.round((p.done / Math.max(1, p.ayahs)) * 100) : 0,
      need: 100,
    };
  },
  juzComplete: (c, r, ref) => {
    if (ref?.kind !== "juz") return { kind: c.kind, ok: false, actual: null, need: null };
    return {
      kind: c.kind,
      ok: r.journey.completedJuz.includes(ref.juz),
      actual: r.journey.completedJuz.length,
      need: null,
    };
  },
  khatm: (c, r) => ({
    kind: c.kind,
    ok: r.journey.coverage.ayahs >= TOTAL_AYAHS,
    actual: r.journey.pct,
    need: 100,
  }),
};

export function evaluate(
  conditions: readonly Condition[],
  r: StudentReport | null,
  ref: AchievementRef = null,
): Eligibility {
  if (!conditions.length) return { eligible: true, manual: true, checks: [] };
  if (!r)
    return {
      eligible: false,
      manual: false,
      checks: conditions.map((c) => ({ kind: c.kind, ok: false, actual: null, need: null })),
    };
  const checks = conditions.map((c) => {
    const f = EVALUATORS[c.kind as ConditionKind];
    return f ? f(c, r, ref) : { kind: c.kind, ok: false, actual: null, need: null };
  });
  return { eligible: checks.every((x) => x.ok), manual: false, checks };
}

/** يقترح نوع الشهادة ومرجعها من آخر محطة في سجل الإنجاز (عند الدخول من السجل). */
export function suggestFromMilestones(r: StudentReport): { type: string; ref: AchievementRef } {
  const m = r.milestones[0] ?? r.journey.milestones.at(-1);
  if (!m) return { type: "memorization", ref: null };
  switch (m.kind) {
    case "khatm":
      return { type: "quran_complete", ref: null };
    case "juz":
      return { type: "juz_complete", ref: { kind: "juz", juz: m.juz } };
    case "surah":
      return { type: "surah_complete", ref: { kind: "surah", surah: m.surah } };
    case "regular":
      return { type: "perseverance", ref: null };
    case "improved":
      return { type: "excellence", ref: null };
    default:
      return { type: "achievement", ref: null };
  }
}
