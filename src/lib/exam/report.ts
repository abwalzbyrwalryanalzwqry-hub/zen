/**
 * تقرير المعلّم لنتائج اختبارات طلابه — تجميع خالص بلا شبكة ولا واجهة.
 *
 * المدخل صفوف `exam_results` كما تُقرأ من قاعدة البيانات (مع وصف الاختبار
 * ومواضع الخطأ)، والمخرج ملخّص للحلقة وملخّص لكل طالب. كل الحسابات هنا
 * حتمية وقابلة للاختبار، فالواجهة تعرض فقط ولا تحسب.
 */

import type { MasteryLevel } from "./types";

export const MASTERY_ORDER: MasteryLevel[] = [
  "mastery",
  "proficient",
  "good",
  "needs_review",
  "weak",
];

/** عتبات «يحتاج متابعة» — مجمّعة هنا لتُختبر وتُعدَّل من مكان واحد. */
export const ATTENTION_RULES = {
  /** متوسط أقل من هذا ⇒ يحتاج متابعة. */
  lowAverage: 60,
  /** فرق المتوسط بين آخر الاختبارات وما قبلها الذي يُعدّ تحسّناً أو تراجعاً. */
  trendDelta: 5,
  /** عدد مواضع الخطأ غير المُرسلة إلى المراجعة الذي يستدعي التنبيه. */
  pendingSpots: 3,
} as const;

export type ReportErrorRow = {
  surah_number: number;
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
  errors: number;
  sent_to_review: boolean;
};

export type ReportResultRow = {
  id: string;
  student_id: string;
  exam_id: string;
  percentage: number;
  score: number;
  possible: number;
  mastery: string;
  correct_count: number;
  wrong_count: number;
  skipped_count: number;
  duration_seconds: number;
  analysis: unknown;
  created_at: string;
  exam: {
    scope_label: string;
    difficulty: string;
    mode: string;
    question_count: number;
  } | null;
  errors: ReportErrorRow[];
};

export type Trend = "up" | "down" | "flat";

export type FamilyStat = { family: string; correct: number; total: number; percentage: number };

export type WeakSpot = {
  surahNumber: number;
  surahName: string;
  fromAyah: number;
  toAyah: number;
  errors: number;
  /** في كم اختباراً ظهر هذا الموضع. */
  occurrences: number;
  /** هل بقي منه جزء لم يُرسَل إلى المراجعة المتباعدة؟ */
  pending: boolean;
};

export type AttentionReason = "low_average" | "last_weak" | "declining" | "pending_review";

export const ATTENTION_LABEL: Record<AttentionReason, string> = {
  low_average: "متوسط منخفض",
  last_weak: "آخر اختبار ضعيف",
  declining: "مستواه يتراجع",
  pending_review: "مواضع خطأ لم تُراجَع",
};

export type StudentExamReport = {
  studentId: string;
  examCount: number;
  averagePercentage: number;
  bestPercentage: number;
  lastPercentage: number;
  lastMastery: MasteryLevel | null;
  lastAt: string;
  totalSeconds: number;
  trend: Trend | null;
  trendDelta: number | null;
  mastery: Record<MasteryLevel, number>;
  families: FamilyStat[];
  weakSpots: WeakSpot[];
  pendingSpots: number;
  attention: AttentionReason[];
  /** الاختبارات الأحدث أولاً. */
  results: ReportResultRow[];
};

export type ClassExamReport = {
  studentCount: number;
  examCount: number;
  averagePercentage: number;
  attentionCount: number;
  mastery: Record<MasteryLevel, number>;
  families: FamilyStat[];
  students: StudentExamReport[];
};

// ─────────────────────── أدوات صغيرة ───────────────────────

function emptyMastery(): Record<MasteryLevel, number> {
  return { mastery: 0, proficient: 0, good: 0, needs_review: 0, weak: 0 };
}

function isMastery(value: string): value is MasteryLevel {
  return (MASTERY_ORDER as string[]).includes(value);
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pct(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

/** يقرأ `analysis.byFamily` بحذر: الحقل jsonb وقد يأتي ناقصاً من إصدار أقدم. */
export function readFamilies(
  analysis: unknown,
): { family: string; correct: number; total: number }[] {
  if (!analysis || typeof analysis !== "object") return [];
  const raw = (analysis as { byFamily?: unknown }).byFamily;
  if (!Array.isArray(raw)) return [];
  const out: { family: string; correct: number; total: number }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { family, correct, total } = item as Record<string, unknown>;
    if (typeof family !== "string" || typeof correct !== "number" || typeof total !== "number")
      continue;
    if (total <= 0 || correct < 0) continue;
    out.push({ family, correct: Math.min(correct, total), total });
  }
  return out;
}

/** يجمع أداء العائلات عبر عدة نتائج، الأضعف أولاً. */
export function aggregateFamilies(rows: { analysis: unknown }[]): FamilyStat[] {
  const map = new Map<string, { correct: number; total: number }>();
  for (const row of rows) {
    for (const f of readFamilies(row.analysis)) {
      const entry = map.get(f.family) ?? { correct: 0, total: 0 };
      entry.correct += f.correct;
      entry.total += f.total;
      map.set(f.family, entry);
    }
  }
  return [...map.entries()]
    .map(([family, v]) => ({ family, ...v, percentage: pct(v.correct, v.total) }))
    .sort((a, b) => a.percentage - b.percentage || b.total - a.total);
}

/**
 * يدمج مواضع الخطأ المتكررة أو المتداخلة في السورة نفسها، فخطأ في «الكهف 9–12»
 * ثم «الكهف 11–14» يظهر موضعاً واحداً «الكهف 9–14» بمجموع أخطائه.
 */
export function mergeWeakSpots(
  groups: { resultId: string; errors: ReportErrorRow[] }[],
  limit = 5,
): WeakSpot[] {
  type Item = ReportErrorRow & { resultId: string };
  const items: Item[] = groups.flatMap((g) =>
    g.errors.map((e) => ({ ...e, resultId: g.resultId })),
  );
  items.sort((a, b) => a.surah_number - b.surah_number || a.from_ayah - b.from_ayah);

  const merged: (WeakSpot & { results: Set<string> })[] = [];
  for (const it of items) {
    const last = merged[merged.length - 1];
    if (last && last.surahNumber === it.surah_number && it.from_ayah <= last.toAyah) {
      last.toAyah = Math.max(last.toAyah, it.to_ayah);
      last.errors += it.errors;
      last.results.add(it.resultId);
      last.occurrences = last.results.size;
      last.pending = last.pending || !it.sent_to_review;
    } else {
      merged.push({
        surahNumber: it.surah_number,
        surahName: it.surah_name,
        fromAyah: it.from_ayah,
        toAyah: it.to_ayah,
        errors: it.errors,
        occurrences: 1,
        pending: !it.sent_to_review,
        results: new Set([it.resultId]),
      });
    }
  }

  return merged
    .sort(
      (a, b) =>
        b.errors - a.errors ||
        b.occurrences - a.occurrences ||
        a.surahNumber - b.surahNumber ||
        a.fromAyah - b.fromAyah,
    )
    .slice(0, limit)
    .map(({ results: _results, ...spot }) => spot);
}

/**
 * الاتجاه: متوسط أحدث الاختبارات مقابل متوسط ما قبلها بالعدد نفسه (حتى ثلاثة).
 * يحتاج اختبارين على الأقل، وإلا فلا اتجاه.
 */
export function computeTrend(newestFirst: number[]): { trend: Trend; delta: number } | null {
  const k = Math.min(3, Math.floor(newestFirst.length / 2));
  if (k < 1) return null;
  const recent = mean(newestFirst.slice(0, k));
  const previous = mean(newestFirst.slice(k, 2 * k));
  const delta = Math.round(recent - previous);
  const trend: Trend =
    delta >= ATTENTION_RULES.trendDelta
      ? "up"
      : delta <= -ATTENTION_RULES.trendDelta
        ? "down"
        : "flat";
  return { trend, delta };
}

// ─────────────────────── التقرير ───────────────────────

export function buildStudentReport(studentId: string, rows: ReportResultRow[]): StudentExamReport {
  const results = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const percentages = results.map((r) => r.percentage);
  const mastery = emptyMastery();
  for (const r of results) if (isMastery(r.mastery)) mastery[r.mastery] += 1;

  const latest = results[0];
  const trend = computeTrend(percentages);
  const weakSpots = mergeWeakSpots(results.map((r) => ({ resultId: r.id, errors: r.errors })));
  const pendingSpots = results.reduce(
    (n, r) => n + r.errors.filter((e) => !e.sent_to_review).length,
    0,
  );
  const averagePercentage = Math.round(mean(percentages));
  const lastMastery = latest && isMastery(latest.mastery) ? latest.mastery : null;

  const attention: AttentionReason[] = [];
  if (averagePercentage < ATTENTION_RULES.lowAverage) attention.push("low_average");
  if (lastMastery === "weak" || lastMastery === "needs_review") attention.push("last_weak");
  if (trend?.trend === "down") attention.push("declining");
  if (pendingSpots >= ATTENTION_RULES.pendingSpots) attention.push("pending_review");

  return {
    studentId,
    examCount: results.length,
    averagePercentage,
    bestPercentage: percentages.length ? Math.max(...percentages) : 0,
    lastPercentage: latest?.percentage ?? 0,
    lastMastery,
    lastAt: latest?.created_at ?? "",
    totalSeconds: results.reduce((n, r) => n + (r.duration_seconds || 0), 0),
    trend: trend?.trend ?? null,
    trendDelta: trend?.delta ?? null,
    mastery,
    families: aggregateFamilies(results),
    weakSpots,
    pendingSpots,
    attention,
    results,
  };
}

/**
 * يبني تقرير الحلقة. الطلاب مرتّبون: من يحتاج متابعة أولاً (الأكثر أسباباً)،
 * ثم الأقل متوسطاً — فأول ما يراه المعلّم هو من يحتاجه أكثر.
 */
export function buildClassReport(rows: ReportResultRow[]): ClassExamReport {
  const byStudent = new Map<string, ReportResultRow[]>();
  for (const r of rows) {
    const list = byStudent.get(r.student_id) ?? [];
    list.push(r);
    byStudent.set(r.student_id, list);
  }

  const students = [...byStudent.entries()]
    .map(([id, list]) => buildStudentReport(id, list))
    .sort(
      (a, b) =>
        b.attention.length - a.attention.length ||
        a.averagePercentage - b.averagePercentage ||
        a.studentId.localeCompare(b.studentId),
    );

  const mastery = emptyMastery();
  for (const r of rows) if (isMastery(r.mastery)) mastery[r.mastery] += 1;

  return {
    studentCount: students.length,
    examCount: rows.length,
    // متوسط الطلاب لا متوسط الاختبارات، كي لا يطغى طالب كثير الاختبارات على الحلقة.
    averagePercentage: Math.round(mean(students.map((s) => s.averagePercentage))),
    attentionCount: students.filter((s) => s.attention.length > 0).length,
    mastery,
    families: aggregateFamilies(rows),
    students,
  };
}

export type ReportPeriod = "7" | "30" | "90" | "all";

export const PERIOD_LABEL: Record<ReportPeriod, string> = {
  "7": "7 أيام",
  "30": "30 يوماً",
  "90": "3 أشهر",
  all: "الكل",
};

/** بداية الفترة بصيغة ISO، أو null لـ «الكل». */
export function periodStart(period: ReportPeriod, now: Date = new Date()): string | null {
  if (period === "all") return null;
  const d = new Date(now.getTime() - Number(period) * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

/** عدد الاختبارات بصيغة عربية سليمة: اختبار واحد، اختباران، 3 اختبارات، 11 اختباراً. */
export function countExams(n: number): string {
  if (n === 1) return "اختبار واحد";
  if (n === 2) return "اختباران";
  if (n >= 3 && n <= 10) return `${n} اختبارات`;
  return `${n} اختباراً`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} ث`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} د`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} س ${m} د` : `${h} س`;
}
