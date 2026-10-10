/**
 * المحرّك: مخطط → بِركة أسئلة → توليد → اعتماد → لقطة مجمّدة، ثم التصحيح.
 *
 * كل شيء هنا حتمي: نفس البذرة ونفس المخطط يُنتجان نفس الاختبار. والتصحيح
 * لا يستعين بأي ذكاء اصطناعي — مقارنة صريحة بمعرّفات الخيارات والترتيب.
 */

import { loadQuranCorpus, type Ayah, type QuranCorpus } from "./corpus";
import { rulesFor, typeAllowed } from "./difficulty";
import { GENERATORS, type GeneratorContext } from "./generators";
import { createRng, newSeed } from "./random";
import { buildScope, isInScope, surahName, type ExamScope } from "./scope";
import {
  DuplicateChecker,
  approveQuestion,
  qualityGate,
  type QualityGateReport,
  type RejectionReason,
} from "./validators";
import {
  ENGINE_VERSION,
  MASTERY_LABEL,
  MAX_QUESTIONS,
  QUESTION_FAMILY,
  QUESTION_TYPES,
  type Difficulty,
  type ExamAttempt,
  type ExamBlueprint,
  type ExamQuestion,
  type ExamResult,
  type ExamSnapshot,
  type GradeKind,
  type GradedAnswer,
  type MasteryLevel,
  type QuestionAnswer,
  type QuestionType,
} from "./types";

export type BuildExamOutcome =
  | { ok: true; snapshot: ExamSnapshot; report: QualityGateReport }
  | { ok: false; problems: string[]; suggestions: string[]; report?: QualityGateReport };

/** الأنواع المطلوبة فعلياً بعد حساب اختيار المستخدم وقيود المستوى. */
export function resolveTypes(blueprint: ExamBlueprint): QuestionType[] {
  const allowed = rulesFor(blueprint.difficulty).allowedTypes;
  switch (blueprint.types.kind) {
    case "single":
    case "multiple": {
      const chosen = blueprint.types.types.filter((t) => typeAllowed(t, blueprint.difficulty));
      return chosen.length ? chosen : [...allowed];
    }
    case "varied":
    case "random":
      return [...allowed];
  }
}

function ayahsInScope(corpus: QuranCorpus, scope: ExamScope): Ayah[] {
  return corpus.ayahs.filter((a) => isInScope(scope, a.surah, a.ayah));
}

/**
 * خطة التوزيع: في «متنوّع» تُوزَّع الأسئلة بالتساوي على الأنواع المطلوبة ثم
 * تُعاد الحصص غير المتاحة إلى الأنواع الأخرى. لا تُخترع أسئلة للوصول إلى العدد.
 */
function coveragePlan(types: QuestionType[], count: number, rng: ReturnType<typeof createRng>) {
  const plan: QuestionType[] = [];
  if (types.length === 1) {
    for (let i = 0; i < count; i += 1) plan.push(types[0]!);
    return plan;
  }
  const perType = Math.floor(count / types.length);
  for (const type of types) {
    for (let i = 0; i < perType; i += 1) plan.push(type);
  }
  while (plan.length < count) plan.push(rng.pick(types));
  return rng.shuffle(plan);
}

/** يبني اختباراً كاملاً، أو يشرح سبب تعذّر ذلك مع اقتراحات عملية. */
export async function buildExam(input: ExamBlueprint): Promise<BuildExamOutcome> {
  const blueprint: ExamBlueprint = {
    ...input,
    seed: input.seed || newSeed(),
    questionCount: Math.max(1, Math.min(input.questionCount, MAX_QUESTIONS)),
  };

  const scopeResult = buildScope(blueprint.scopeInput);
  if (!scopeResult.ok) {
    return {
      ok: false,
      problems: scopeResult.errors.map((e) => e.message),
      suggestions: ["صحّح النطاق ثم أعد المحاولة."],
    };
  }
  const scope = scopeResult.scope;

  const corpus = await loadQuranCorpus();
  const pool = ayahsInScope(corpus, scope);
  const types = resolveTypes(blueprint);
  const rng = createRng(`${blueprint.seed}|${scope.label}|${blueprint.difficulty}`);

  const ctx: GeneratorContext = {
    corpus,
    scope,
    difficulty: blueprint.difficulty,
    rng,
    pool,
    memo: new Map(),
  };

  const duplicates = new DuplicateChecker();
  const rejections: Record<RejectionReason, number> = {
    scope_leak: 0,
    text_not_in_corpus: 0,
    duplicate: 0,
    difficulty: 0,
    malformed: 0,
  };

  const plan = coveragePlan(types, blueprint.questionCount, rng);
  const approved: ExamQuestion[] = [];
  // محاولات محدودة لكل سؤال: النطاق الضيق قد يرفض كثيراً، ولا يجوز الدوران بلا حد.
  const maxAttemptsPerQuestion = 24;

  for (const plannedType of plan) {
    let placed = false;
    // يُجرَّب النوع المخطَّط أولاً، ثم بقية الأنواع المتاحة بترتيب حتمي.
    const order = [plannedType, ...types.filter((t) => t !== plannedType)];

    for (const type of order) {
      const generate = GENERATORS[type];
      for (let attempt = 0; attempt < maxAttemptsPerQuestion && !placed; attempt += 1) {
        const draft = generate(ctx);
        if (!draft) break;
        const outcome = approveQuestion(draft, { corpus, scope, duplicates });
        if (!outcome.approved) {
          rejections[outcome.reason] += 1;
          continue;
        }
        approved.push({
          ...draft,
          id: `q${approved.length + 1}`,
          index: approved.length,
        });
        placed = true;
      }
      if (placed) break;
    }
    if (!placed && !blueprint.allowRepeats && approved.length >= blueprint.questionCount) break;
  }

  const report = qualityGate({
    questions: approved,
    requested: blueprint.questionCount,
    allowRepeats: blueprint.allowRepeats,
    requestedTypes: types,
    rejections,
  });

  if (!report.passed) {
    const suggestions: string[] = [];
    if (scope.ayahCount < 25) suggestions.push("وسّع نطاق الاختبار (سورة كاملة أو مقاطع أكثر).");
    if (blueprint.questionCount > 10) suggestions.push("قلّل عدد الأسئلة.");
    if (types.length < 4) suggestions.push("أضف أنواع أسئلة أخرى.");
    if (blueprint.difficulty === "mastery" || blueprint.difficulty === "hard") {
      suggestions.push(
        "خفّف مستوى الصعوبة — المستويات الأعلى تتطلب متشابهات وكلمات نادرة داخل النطاق.",
      );
    }
    if (!blueprint.allowRepeats) suggestions.push("أو اسمح بتكرار الأسئلة صراحةً.");
    return { ok: false, problems: report.problems, suggestions, report };
  }

  const snapshot: ExamSnapshot = Object.freeze({
    id: `exam_${blueprint.seed}`,
    createdAt: new Date().toISOString(),
    blueprint: Object.freeze({ ...blueprint }),
    scope,
    questions: Object.freeze(approved.slice(0, blueprint.questionCount)),
    corpus: Object.freeze({ edition: corpus.edition, sha256: corpus.sha256 }),
    engineVersion: ENGINE_VERSION,
  });

  return { ok: true, snapshot, report };
}

// ─────────────────────────── التصحيح ───────────────────────────

/** تصحيح سؤال واحد — حتمي بالكامل. */
export function gradeQuestion(
  question: ExamQuestion,
  answer: QuestionAnswer | undefined,
): GradedAnswer {
  const base = {
    questionId: question.id,
    type: question.type,
    difficulty: question.difficulty,
    refs: question.refs,
    reference: question.reference,
    possible: 1,
  };

  if (!answer || answer.value == null || (Array.isArray(answer.value) && !answer.value.length)) {
    return { ...base, kind: "skipped", earned: 0 };
  }

  if (question.answerShape === "ordering") {
    const expected = question.correct as string[];
    const given = Array.isArray(answer.value) ? answer.value : [answer.value];
    if (given.length < expected.length) {
      return { ...base, kind: "incomplete", earned: 0 };
    }
    const exact = expected.every((id, i) => given[i] === id);
    if (exact) return { ...base, kind: "correct", earned: 1 };
    // نفس العناصر بترتيب خاطئ ⇒ تصنيف مختلف عن الإجابة الخاطئة تماماً.
    const sameSet =
      given.length === expected.length && [...given].sort().join() === [...expected].sort().join();
    return { ...base, kind: sameSet ? "wrong_order" : "wrong", earned: 0 };
  }

  const given = Array.isArray(answer.value) ? answer.value[0] : answer.value;
  const kind: GradeKind = given === question.correct ? "correct" : "wrong";
  return { ...base, kind, earned: kind === "correct" ? 1 : 0 };
}

/**
 * مستوى الإتقان: ليس 90% = متقن بشكل أعمى. يأخذ في الحساب صعوبة الأسئلة، وتنوّع
 * أنواعها، والأخطاء في العائلة نفسها (تكرار الخطأ في المتشابهات مثلاً يمنع وسم
 * «متقن» حتى مع نسبة عالية).
 */
function assessMastery(input: {
  percentage: number;
  difficulty: Difficulty;
  byFamily: { family: string; correct: number; total: number; percentage: number }[];
  distinctTypes: number;
  totalQuestions: number;
}): { level: MasteryLevel; reasons: string[] } {
  const reasons: string[] = [];
  const weakFamilies = input.byFamily.filter((f) => f.total >= 2 && f.percentage < 60);
  const hardLevel = input.difficulty === "hard" || input.difficulty === "mastery";

  let level: MasteryLevel;
  if (input.percentage >= 95 && hardLevel && !weakFamilies.length && input.distinctTypes >= 3) {
    level = "mastery";
    reasons.push("درجة عالية في مستوى صعب مع تنوّع الأنواع وبلا ضعف في أي عائلة.");
  } else if (input.percentage >= 85 && !weakFamilies.length) {
    level = "proficient";
    reasons.push("إجابات متقنة في معظم الأسئلة بلا عائلة ضعيفة.");
  } else if (input.percentage >= 70) {
    level = "good";
  } else if (input.percentage >= 50) {
    level = "needs_review";
  } else {
    level = "weak";
  }

  if (level === "mastery" && input.totalQuestions < 10) {
    level = "proficient";
    reasons.push("عدد الأسئلة أقل من 10، فلا يكفي للحكم بالإتقان الكامل.");
  }
  if (weakFamilies.length) {
    reasons.push(`ضعف واضح في: ${weakFamilies.map((f) => f.family).join("، ")}.`);
    if (level === "proficient") level = "good";
  }
  if (!hardLevel && input.percentage >= 95) {
    reasons.push("النتيجة ممتازة في مستوى غير صعب — جرّب مستوى «صعب» أو «متقن» لقياس الإتقان.");
  }
  return { level, reasons };
}

/** يجمع مواضع الخطأ في مقاطع متصلة لاقتراح مراجعتها. */
function collectWeakSpots(graded: GradedAnswer[]) {
  const counts = new Map<string, { surah: number; ayah: number; errors: number }>();
  for (const g of graded) {
    if (g.kind === "correct") continue;
    // أول مرجع هو مصدر السؤال؛ بقية المراجع مشتتات لا تُحمَّل على الطالب.
    const ref = g.refs[0];
    if (!ref) continue;
    const key = `${ref.surah}:${ref.ayah}`;
    const prev = counts.get(key);
    if (prev) prev.errors += 1;
    else counts.set(key, { surah: ref.surah, ayah: ref.ayah, errors: 1 });
  }

  const sorted = [...counts.values()].sort((a, b) =>
    a.surah === b.surah ? a.ayah - b.ayah : a.surah - b.surah,
  );
  const spots: ExamResult["weakSpots"] = [];
  for (const item of sorted) {
    const last = spots[spots.length - 1];
    if (last && last.surah === item.surah && item.ayah <= last.toAyah + 2) {
      last.toAyah = Math.max(last.toAyah, item.ayah);
      last.errors += item.errors;
    } else {
      spots.push({
        surah: item.surah,
        surahName: surahName(item.surah),
        fromAyah: item.ayah,
        toAyah: item.ayah,
        errors: item.errors,
      });
    }
  }
  return spots.sort((a, b) => b.errors - a.errors);
}

/** تصحيح محاولة كاملة وإخراج النتيجة وتحليل الأخطاء. */
export function gradeAttempt(snapshot: ExamSnapshot, attempt: ExamAttempt): ExamResult {
  const graded = snapshot.questions.map((q) => gradeQuestion(q, attempt.answers[q.id]));

  const score = graded.reduce((sum, g) => sum + g.earned, 0);
  const possible = graded.length;
  const percentage = possible ? Math.round((score / possible) * 100) : 0;

  const familyMap = new Map<string, { correct: number; total: number }>();
  for (const g of graded) {
    const family = QUESTION_FAMILY[g.type];
    const entry = familyMap.get(family) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (g.kind === "correct") entry.correct += 1;
    familyMap.set(family, entry);
  }
  const byFamily = [...familyMap.entries()].map(([family, v]) => ({
    family,
    correct: v.correct,
    total: v.total,
    percentage: v.total ? Math.round((v.correct / v.total) * 100) : 0,
  }));

  const difficultyMap = new Map<Difficulty, { correct: number; total: number }>();
  for (const g of graded) {
    const entry = difficultyMap.get(g.difficulty) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (g.kind === "correct") entry.correct += 1;
    difficultyMap.set(g.difficulty, entry);
  }

  const { level, reasons } = assessMastery({
    percentage,
    difficulty: snapshot.blueprint.difficulty,
    byFamily,
    distinctTypes: new Set(snapshot.questions.map((q) => q.type)).size,
    totalQuestions: possible,
  });

  const seconds = Object.values(attempt.answers).reduce((sum, a) => sum + (a.seconds || 0), 0);

  return {
    examId: snapshot.id,
    attemptId: attempt.id,
    score,
    possible,
    percentage,
    correctCount: graded.filter((g) => g.kind === "correct").length,
    wrongCount: graded.filter(
      (g) => g.kind === "wrong" || g.kind === "wrong_order" || g.kind === "incomplete",
    ).length,
    skippedCount: graded.filter((g) => g.kind === "skipped").length,
    mastery: level,
    masteryReasons: reasons,
    byFamily: byFamily.sort((a, b) => a.percentage - b.percentage),
    byDifficulty: [...difficultyMap.entries()].map(([difficulty, v]) => ({
      difficulty,
      correct: v.correct,
      total: v.total,
    })),
    weakSpots: collectWeakSpots(graded),
    graded,
    durationSeconds: seconds,
  };
}

export { MASTERY_LABEL, QUESTION_TYPES };
