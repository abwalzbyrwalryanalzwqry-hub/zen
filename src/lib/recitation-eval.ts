/**
 * تقييم دقة التسميع الآلي (تدقيق أكتوبر 2026، المرحلة 3). سؤال واحد: هل يكشف المسار (تفريغ ← مقارنة بالنص)
 * أخطاء الطالب، دون إنذارات كاذبة على التلاوة السليمة؟
 *
 * - `gradeRecitation`: حكم حتمي على حالة واحدة (تسجيل حقيقي أو نص مزروع الأخطاء) بمقارنة الكلمات نفسها
 *   التي يستعملها الخادم (`summarizeDiff`).
 * - `plantError`: يزرع خطأً معروفاً (حذف، إبدال، تكرار، تقديم) في نص مرجعي، لاختبار المقارنة بلا صوت.
 * - `summarizeEval`: نسبة الاكتشاف والإنذار الكاذب، وبوابة القبول قبل تفعيل التحليل الآلي للمستخدمين.
 *
 * التشغيل على تسجيلات حقيقية: `scripts/recitation-eval.mjs` و`ai-eval/recitation/README.md`.
 */
import { summarizeDiff, words } from "./tajweed-diff";

export type EvalCase = {
  id: string;
  /** هل في التلاوة خطأ واحد على الأقل (بحكم معلّم متقن)؟ */
  hasError: boolean;
  reference: string;
  transcript: string;
};

export type EvalVerdict = { id: string; hasError: boolean; flagged: boolean; score: number };

/** بوابة القبول (المرحلة 3.4). */
export const RECITATION_GATE = { minDetection: 0.9, maxFalseAlarm: 0.1, minCases: 20 } as const;

export function gradeRecitation(c: EvalCase): EvalVerdict {
  const d = summarizeDiff(c.reference, c.transcript);
  // أي كلمة خاطئة أو ناقصة أو زائدة = تنبيه للطالب.
  const flagged = d.wrong + d.missing + d.extra > 0;
  return { id: c.id, hasError: c.hasError, flagged, score: d.score };
}

export type EvalSummary = {
  cases: number;
  withErrors: number;
  clean: number;
  detection: number;
  falseAlarm: number;
  pass: boolean;
  missed: string[];
  falseAlarms: string[];
};

export function summarizeEval(v: EvalVerdict[]): EvalSummary {
  const err = v.filter((x) => x.hasError);
  const ok = v.filter((x) => !x.hasError);
  const detection = err.length ? err.filter((x) => x.flagged).length / err.length : 0;
  const falseAlarm = ok.length ? ok.filter((x) => x.flagged).length / ok.length : 0;
  const pass =
    v.length >= RECITATION_GATE.minCases &&
    err.length > 0 &&
    ok.length > 0 &&
    detection >= RECITATION_GATE.minDetection &&
    falseAlarm <= RECITATION_GATE.maxFalseAlarm;
  return {
    cases: v.length,
    withErrors: err.length,
    clean: ok.length,
    detection,
    falseAlarm,
    pass,
    missed: err.filter((x) => !x.flagged).map((x) => x.id),
    falseAlarms: ok.filter((x) => x.flagged).map((x) => x.id),
  };
}

export type PlantedError = "delete" | "substitute" | "repeat" | "swap";

/** يزرع خطأً واحداً في الموضع `at` (يُقصّ إلى حدود النص). النص الناتج بلا تشكيل كما يفرّغه النموذج. */
export function plantError(reference: string, kind: PlantedError, at: number): string {
  const w = words(reference);
  if (w.length < 2) return w.join(" ");
  const i = Math.max(0, Math.min(w.length - 2, at));
  const out = [...w];
  if (kind === "delete") out.splice(i, 1);
  else if (kind === "substitute") out[i] = out[i] === "من" ? "في" : "من";
  else if (kind === "repeat") out.splice(i, 0, out[i]);
  else [out[i], out[i + 1]] = [out[i + 1], out[i]];
  return out.join(" ");
}
