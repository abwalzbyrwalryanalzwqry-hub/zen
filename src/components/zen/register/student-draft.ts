import {
  EVAL_CRITERIA,
  directionOf,
  rangeToSegments,
  scoreToGrade,
  segmentsToRange,
  suggestStart,
  validateRange,
  type DayKind,
  type DayStudent,
  type ErrorType,
  type Evaluation,
  type QuranRange,
  type RangeDirection,
} from "@/lib/daily-record";
import type { EntryPayload } from "@/lib/daily-record-api";

/** مسودة لوحة الطالب: من سطره، وإليه (ما يُرسل للخادم)، وما يُحفظ تلقائياً منها. */
export interface WorkDraft {
  on: boolean;
  range: Partial<QuranRange>;
  /** اتجاه المدى: من الفاتحة نحو الناس، أو من الناس صعوداً (1.14.0). */
  direction: RangeDirection;
  grade: number | null;
  error_type: ErrorType;
  notes: string;
  /** عدّاد الأخطاء المحلي (لا يُرسل)؛ null ما لم يُستعمل. */
  mistakes: number | null;
}
export interface Draft {
  memorize: WorkDraft;
  review: WorkDraft;
  evaluation: Evaluation;
  note: string;
  /** سبب الغياب أو الاستئذان (DR-02). */
  reason: string;
}

/**
 * المدى المقترح لنوع في اتجاه: يبدأ من الآية التي تلي آخر ما سجّله المعلّم في آخر جلسة سابقة (حفظاً أو
 * مراجعة)، وتبقى النهاية للمعلّم يكملها من هناك (1.35.0). كانت النهاية تُملأ بمقدار آخر مقطع، فإذا كان آخر
 * تسجيل سورة كاملة (ق 1–45 مثلاً) ظهرت السورة التالية كاملة من أولها إلى آخرها بدل موضع التوقف.
 * المقدار نفسه ما زال متاحاً باختصار «مثل آخر مرة».
 */
export const suggestion = (
  s: DayStudent,
  kind: DayKind,
  dir: RangeDirection,
): Partial<QuranRange> => {
  const last = kind === "memorize" ? s.last_memorize : s.last_review;
  return suggestStart(last, dir);
};

export function workDraft(s: DayStudent, kind: DayKind): WorkDraft {
  const w = s[kind];
  const direction = directionOf(s, kind);
  if (w)
    return {
      on: true,
      range: segmentsToRange(w.segments) ?? {},
      direction,
      grade: scoreToGrade(w.score),
      error_type: w.error_type ?? "none",
      notes: w.notes ?? "",
      mistakes: null,
    };
  return {
    on: false,
    range: suggestion(s, kind, direction),
    direction,
    grade: null,
    error_type: "none",
    notes: "",
    mistakes: null,
  };
}
export const draftOf = (s: DayStudent): Draft => ({
  memorize: workDraft(s, "memorize"),
  review: workDraft(s, "review"),
  evaluation: { ...s.evaluation },
  note: s.note ?? "",
  reason: s.reason ?? "",
});
export const same = (a: Draft, b: Draft) =>
  JSON.stringify(payloadOf(a)) === JSON.stringify(payloadOf(b)) &&
  a.reason.trim() === b.reason.trim();

/** ما يُرسل للخادم: كل الأقسام، والمعطَّل منها null (يحذف ما سُجّل له اليوم). */
export function payloadOf(d: Draft): EntryPayload {
  const work = (w: WorkDraft) =>
    w.on
      ? {
          segments: rangeToSegments(w.range as QuranRange),
          grade: w.grade ?? 0,
          error_type: w.error_type,
          notes: w.notes.trim() || null,
          direction: w.direction,
        }
      : null;
  const hasEval = EVAL_CRITERIA.some((c) => d.evaluation[c] != null);
  return {
    memorize: work(d.memorize),
    review: work(d.review),
    evaluation: hasEval ? d.evaluation : null,
    note: d.note.trim() || null,
  };
}
export const workInvalid = (w: WorkDraft) => w.on && (!!validateRange(w.range) || !w.grade);

/**
 * ما يُحفظ تلقائياً الآن: القسم الذي لم يكتمل (مدى أو مستوى) يُستبدل بما حُفظ له، فيُحفظ الباقي ولا يُنتظر
 * اكتمال الكل؛ ويُرسل بلا مفتاحه فيبقى على الخادم كما كان.
 */
export function savable(d: Draft, saved: Draft): { draft: Draft; payload: EntryPayload } {
  const draft = {
    ...d,
    memorize: workInvalid(d.memorize) ? saved.memorize : d.memorize,
    review: workInvalid(d.review) ? saved.review : d.review,
  };
  const payload = payloadOf(draft);
  if (workInvalid(d.memorize)) delete payload.memorize;
  if (workInvalid(d.review)) delete payload.review;
  return { draft, payload };
}
