/**
 * طبقات التحقق: لا سؤال يُعرض إلا بعد المرور بها كلها.
 *
 *   مولّد ← مدقّق النطاق ← مدقّق سلامة النص ← مانع التكرار ← مدقّق الصعوبة ← معتمد
 *
 * الترتيب مقصود: النطاق أولاً لأنه القاعدة الحرجة، ثم سلامة النص لأن أي نص لا
 * يوجد في المتن يعني عطلاً في المولّد، ثم التكرار، ثم الصعوبة.
 */

import type { QuranCorpus } from "./corpus";
import { checkDifficulty } from "./difficulty";
import type { DraftQuestion } from "./generators";
import { isInScope, type ExamScope } from "./scope";
import { normalizeArabic } from "./text";
import type { ExamQuestion, QuestionType } from "./types";

export type RejectionReason =
  "scope_leak" | "text_not_in_corpus" | "duplicate" | "difficulty" | "malformed";

export type ValidationResult =
  { ok: true } | { ok: false; reason: RejectionReason; detail: string };

/**
 * مدقّق النطاق — أهم طبقة. يفشل إذا استند السؤال إلى آية خارج النطاق، سواء في
 * المصدر أو الإجابة أو المشتتات أو المرجع.
 */
export function validateScope(question: DraftQuestion, scope: ExamScope): ValidationResult {
  for (const ref of question.refs) {
    if (!isInScope(scope, ref.surah, ref.ayah)) {
      return {
        ok: false,
        reason: "scope_leak",
        detail: `مرجع خارج النطاق: سورة ${ref.surah} آية ${ref.ayah}`,
      };
    }
  }
  for (const option of question.options) {
    if (option.ref && !isInScope(scope, option.ref.surah, option.ref.ayah)) {
      return {
        ok: false,
        reason: "scope_leak",
        detail: `خيار خارج النطاق: سورة ${option.ref.surah} آية ${option.ref.ayah}`,
      };
    }
  }
  return { ok: true };
}

/**
 * مدقّق سلامة النص: كل نص قرآني معروض يجب أن يكون موجوداً في المتن حرفياً
 * (بعد التطبيع) — إما آية كاملة أو مقطعاً متصلاً منها.
 *
 * الاستثناء الوحيد: خيار «اكتشف الخطأ» المحرَّف عمداً، وهو الإجابة الصحيحة في
 * ذلك النوع تحديداً؛ ويُتحقَّق بدلاً من ذلك أنه **ليس** موجوداً في المتن، وأن
 * المرجع يحمل النص الصحيح.
 */
/**
 * نص النطاق مجموعاً في سلسلة واحدة (بفواصل) — يُبنى مرة لكل نطاق ويُخزَّن.
 *
 * بدون هذا التخزين كان كل خيار في كل محاولة توليد يُعيد ترشيح 6236 آية ثم يقارن
 * نصه بكل آية على حدة: مئات الملايين من العمليات في اختبار من 50 سؤالاً.
 */
const scopedTextCache = new WeakMap<ExamScope, string>();

function scopedHaystack(corpus: QuranCorpus, scope: ExamScope): string {
  const cached = scopedTextCache.get(scope);
  if (cached) return cached;
  const joined = corpus.ayahs
    .filter((a) => isInScope(scope, a.surah, a.ayah))
    .map((a) => a.normalized)
    .join(" \u0000 ");
  scopedTextCache.set(scope, joined);
  return joined;
}

export function validateCorpusText(
  question: DraftQuestion,
  corpus: QuranCorpus,
  scope: ExamScope,
): ValidationResult {
  const haystack = scopedHaystack(corpus, scope);

  const existsInScope = (text: string): boolean => {
    const n = normalizeArabic(text);
    if (!n) return false;
    return haystack.includes(n);
  };

  if (
    question.passage &&
    question.type !== "missing_between" &&
    question.type !== "diff_two_ayahs"
  ) {
    const passage = question.passage.replace(/…/g, " ").trim();
    if (passage && !existsInScope(passage)) {
      return {
        ok: false,
        reason: "text_not_in_corpus",
        detail: "نص السؤال غير موجود في المتن داخل النطاق",
      };
    }
  }

  for (const option of question.options) {
    // خيارات أسماء السور ومواضعها ليست نصاً قرآنياً.
    if (!optionsAreQuranText(question.type)) continue;

    const isCorrect = Array.isArray(question.correct)
      ? question.correct.includes(option.id)
      : question.correct === option.id;

    if (question.type === "spot_the_error" && isCorrect) {
      if (existsInScope(option.text)) {
        return {
          ok: false,
          reason: "text_not_in_corpus",
          detail: "النص المحرَّف في «اكتشف الخطأ» مطابق للمصحف — السؤال بلا إجابة",
        };
      }
      continue;
    }

    if (!existsInScope(option.text)) {
      return {
        ok: false,
        reason: "text_not_in_corpus",
        detail: "خيار لا يوجد نصه في المتن داخل النطاق",
      };
    }
  }
  return { ok: true };
}

/** يمنع تكرار السؤال نفسه أو سؤالاً بنفس المصدر والإجابة بصياغة مختلفة. */
export class DuplicateChecker {
  private signatures = new Set<string>();
  private answerKeys = new Set<string>();

  check(question: DraftQuestion): ValidationResult {
    const signature = question.validation.signature;
    if (this.signatures.has(signature)) {
      return { ok: false, reason: "duplicate", detail: "سؤال مكرر (بصمة متطابقة)" };
    }
    const correctOption = Array.isArray(question.correct)
      ? question.correct.join(">")
      : (question.options.find((o) => o.id === question.correct)?.text ?? "");
    const answerKey = `${question.type}|${normalizeArabic(correctOption)}|${question.refs
      .map((r) => `${r.surah}:${r.ayah}`)
      .sort()
      .join(",")}`;
    if (this.answerKeys.has(answerKey)) {
      return { ok: false, reason: "duplicate", detail: "نفس المصدر مع نفس الإجابة" };
    }
    this.signatures.add(signature);
    this.answerKeys.add(answerKey);
    return { ok: true };
  }

  get size(): number {
    return this.signatures.size;
  }
}

/**
 * هل خيارات هذا النوع نصوص قرآنية؟ أنواع أخرى خياراتها أسماء سور أو مواضع
 * («سورة البقرة · الآية 48»)، فلا تُقاس بمقياس النص القرآني: التطبيع يحذف
 * الأرقام، فموضعان مختلفان يبدوان متطابقين لو قِيسا به.
 */
function optionsAreQuranText(type: QuestionType): boolean {
  return type !== "ayah_to_surah" && type !== "rare_word_to_surah" && type !== "similar_ayah_place";
}

/** فحوص بنيوية: خيارات كافية، إجابة موجودة، لا خيارين متطابقين. */
export function validateShape(question: DraftQuestion): ValidationResult {
  if (question.options.length < 2) {
    return { ok: false, reason: "malformed", detail: "خيارات غير كافية" };
  }
  const raw = question.options.map((o) => o.text.trim());
  if (new Set(raw).size !== raw.length) {
    return { ok: false, reason: "malformed", detail: "خيارات متطابقة" };
  }
  if (optionsAreQuranText(question.type)) {
    const texts = question.options.map((o) => normalizeArabic(o.text));
    if (new Set(texts).size !== texts.length) {
      return { ok: false, reason: "malformed", detail: "خيارات متطابقة بعد التطبيع" };
    }
  }
  // في أسئلة المواضع: لا يتكرر نفس المرجع في خيارين.
  const refs = question.options.filter((o) => o.ref).map((o) => `${o.ref!.surah}:${o.ref!.ayah}`);
  if (new Set(refs).size !== refs.length) {
    return { ok: false, reason: "malformed", detail: "مرجع مكرر في الخيارات" };
  }
  if (Array.isArray(question.correct)) {
    if (question.correct.length !== question.options.length) {
      return { ok: false, reason: "malformed", detail: "ترتيب الإجابة لا يغطي الخيارات" };
    }
    if (new Set(question.correct).size !== question.correct.length) {
      return { ok: false, reason: "malformed", detail: "تكرار في ترتيب الإجابة" };
    }
  } else if (!question.options.some((o) => o.id === question.correct)) {
    return { ok: false, reason: "malformed", detail: "الإجابة الصحيحة لا تقابل أي خيار" };
  }
  return { ok: true };
}

export type PipelineOutcome =
  { approved: true } | { approved: false; reason: RejectionReason; detail: string };

/** خط الاعتماد الكامل لسؤال واحد. */
export function approveQuestion(
  question: DraftQuestion,
  context: { corpus: QuranCorpus; scope: ExamScope; duplicates: DuplicateChecker },
): PipelineOutcome {
  const shape = validateShape(question);
  if (!shape.ok) return { approved: false, reason: shape.reason, detail: shape.detail };

  const scoped = validateScope(question, context.scope);
  if (!scoped.ok) return { approved: false, reason: scoped.reason, detail: scoped.detail };

  const text = validateCorpusText(question, context.corpus, context.scope);
  if (!text.ok) return { approved: false, reason: text.reason, detail: text.detail };

  const difficulty = checkDifficulty({ ...question, id: "draft", index: 0 } as ExamQuestion);
  if (!difficulty.ok) {
    return { approved: false, reason: "difficulty", detail: difficulty.reasons.join(" · ") };
  }

  const duplicate = context.duplicates.check(question);
  if (!duplicate.ok) return { approved: false, reason: duplicate.reason, detail: duplicate.detail };

  return { approved: true };
}

export type QualityGateReport = {
  passed: boolean;
  problems: string[];
  produced: number;
  requested: number;
  typeCoverage: Record<string, number>;
  rejections: Record<RejectionReason, number>;
};

/** بوابة الجودة: تُقرّر هل يبدأ الاختبار أم لا. */
export function qualityGate(input: {
  questions: readonly ExamQuestion[];
  requested: number;
  allowRepeats: boolean;
  requestedTypes: readonly QuestionType[];
  rejections: Record<RejectionReason, number>;
}): QualityGateReport {
  const problems: string[] = [];
  const typeCoverage: Record<string, number> = {};
  for (const q of input.questions) {
    typeCoverage[q.type] = (typeCoverage[q.type] ?? 0) + 1;
  }

  if (input.questions.length === 0) {
    problems.push("لم يُنتج المحرّك أي سؤال صالح ضمن هذا النطاق والإعدادات.");
  } else if (input.questions.length < input.requested && !input.allowRepeats) {
    problems.push(
      `الإعدادات الحالية لا توفّر ${input.requested} سؤالاً فريداً (المتاح ${input.questions.length}).`,
    );
  }

  const ids = new Set(input.questions.map((q) => q.id));
  if (ids.size !== input.questions.length) problems.push("تكرار في معرّفات الأسئلة.");

  const signatures = new Set(input.questions.map((q) => q.validation.signature));
  if (!input.allowRepeats && signatures.size !== input.questions.length) {
    problems.push("تكرار في بصمات الأسئلة.");
  }

  // في الاختبار المتنوّع/العشوائي: لا يُقبل أن ينهار التوزيع إلى نوع واحد.
  if (input.requestedTypes.length > 2 && input.questions.length >= 8) {
    const distinct = Object.keys(typeCoverage).length;
    if (distinct < 2) problems.push("كل الأسئلة من نوع واحد رغم طلب التنويع.");
  }

  return {
    passed: problems.length === 0,
    problems,
    produced: input.questions.length,
    requested: input.requested,
    typeCoverage,
    rejections: input.rejections,
  };
}
