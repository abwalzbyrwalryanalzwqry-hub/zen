/** نماذج محرّك الاختبارات: المخطط، السؤال، اللقطة، المحاولة، النتيجة. */

import type { AyahRef } from "./corpus";
import type { ExamScope, ScopeInput } from "./scope";

/** أنواع الأسئلة المُنفَّذة فعلياً (كل نوع له مولّد ومدقّق واختبارات). */
export const QUESTION_TYPES = [
  "complete_ayah",
  "next_ayah",
  "previous_ayah",
  "missing_between",
  "order_ayahs",
  "ayah_to_surah",
  "surah_to_ayah",
  "rare_word_to_surah",
  "rare_word_to_ayah",
  "similar_ayah_place",
  "diff_two_ayahs",
  "spot_the_error",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  complete_ayah: "أكمل الآية",
  next_ayah: "ما الآية التالية؟",
  previous_ayah: "ما الآية السابقة؟",
  missing_between: "ما بين الآيتين؟",
  order_ayahs: "ترتيب الآيات",
  ayah_to_surah: "أنسب الآية إلى سورتها",
  surah_to_ayah: "اختر آية السورة",
  rare_word_to_surah: "الكلمة النادرة → السورة",
  rare_word_to_ayah: "الكلمة النادرة → الآية",
  similar_ayah_place: "المتشابهات",
  diff_two_ayahs: "الفرق بين آيتين",
  spot_the_error: "اكتشف الخطأ",
};

/** مجموعات الأنواع — تُستخدم في توزيع «متنوّع» وفي تحليل الأخطاء. */
export const QUESTION_FAMILY: Record<QuestionType, string> = {
  complete_ayah: "الإكمال",
  next_ayah: "التسلسل",
  previous_ayah: "التسلسل",
  missing_between: "التسلسل",
  order_ayahs: "الترتيب",
  ayah_to_surah: "السور",
  surah_to_ayah: "السور",
  rare_word_to_surah: "الكلمات",
  rare_word_to_ayah: "الكلمات",
  similar_ayah_place: "المتشابهات",
  diff_two_ayahs: "المتشابهات",
  spot_the_error: "اكتشاف الخطأ",
};

export const DIFFICULTIES = ["easy", "medium", "hard", "mastery"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "سهل",
  medium: "متوسط",
  hard: "صعب",
  mastery: "متقن",
};

export type ExamMode = "practice" | "exam";
export type TimerMode = "none" | "per_question" | "total";
export type TypeSelection =
  | { kind: "single"; types: [QuestionType] }
  | { kind: "multiple"; types: QuestionType[] }
  | { kind: "varied" }
  | { kind: "random" };

/** مخطط الاختبار: كل ما يحدده المستخدم قبل البدء. */
export type ExamBlueprint = {
  scopeInput: ScopeInput;
  questionCount: number;
  types: TypeSelection;
  difficulty: Difficulty;
  mode: ExamMode;
  timer: { mode: TimerMode; seconds: number | null };
  allowRepeats: boolean;
  seed: string;
};

export const MAX_QUESTIONS = 50;
export const QUESTION_COUNT_PRESETS = [5, 10, 15, 20, 30, 50] as const;

/** خيار إجابة — نصه يأتي حرفياً من المتن المرجعي. */
export type QuestionOption = {
  id: string;
  text: string;
  /** المرجع الداخلي لمصدر الخيار (لا يُعرض للمستخدم كأرقام سور). */
  ref?: AyahRef;
};

export type AnswerShape = "single_choice" | "ordering";

export type ExamQuestion = {
  id: string;
  index: number;
  type: QuestionType;
  difficulty: Difficulty;
  /** نص السؤال الموجَّه للمستخدم. */
  prompt: string;
  /** مقطع قرآني يُعرض مع السؤال (كما ورد في المتن). */
  passage: string | null;
  answerShape: AnswerShape;
  options: QuestionOption[];
  /** معرّف الخيار الصحيح، أو ترتيب المعرّفات في أسئلة الترتيب. */
  correct: string | string[];
  /** كل الآيات التي يستند إليها السؤال — تُفحَص كلها ضد النطاق. */
  refs: AyahRef[];
  /** مرجع يُعرض بعد الإجابة (باسم السورة، لا رقمها). */
  reference: string;
  /** بيانات التحقق: ما استند إليه المولّد ليصنّف السؤال بهذه الصعوبة. */
  validation: {
    distractorSimilarity: number;
    /** قرب المشتتات من أقصى قرب متاح داخل النطاق (0..1). */
    relativeSimilarity: number;
    recallDistance: number;
    rareWordFrequency: number | null;
    signature: string;
  };
};

/** لقطة الاختبار المجمَّدة: لا تتغيّر بعد البدء. */
export type ExamSnapshot = {
  id: string;
  createdAt: string;
  blueprint: ExamBlueprint;
  scope: ExamScope;
  questions: readonly ExamQuestion[];
  corpus: { edition: string; sha256: string };
  engineVersion: string;
};

export type QuestionAnswer = {
  questionId: string;
  /** إجابة المستخدم: معرّف خيار، أو ترتيب معرّفات، أو null للتخطي. */
  value: string | string[] | null;
  flagged: boolean;
  seconds: number;
  answeredAt: string | null;
};

export type ExamAttemptStatus = "in_progress" | "submitted" | "abandoned";

export type ExamAttempt = {
  id: string;
  examId: string;
  startedAt: string;
  endedAt: string | null;
  status: ExamAttemptStatus;
  currentIndex: number;
  answers: Record<string, QuestionAnswer>;
};

export type GradeKind = "correct" | "wrong_order" | "incomplete" | "wrong" | "skipped";

export type GradedAnswer = {
  questionId: string;
  type: QuestionType;
  difficulty: Difficulty;
  kind: GradeKind;
  earned: number;
  possible: number;
  refs: AyahRef[];
  reference: string;
};

export type MasteryLevel = "mastery" | "proficient" | "good" | "needs_review" | "weak";

export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  mastery: "متقن",
  proficient: "متمكّن",
  good: "جيد",
  needs_review: "يحتاج مراجعة",
  weak: "ضعيف",
};

export type ExamResult = {
  examId: string;
  attemptId: string;
  score: number;
  possible: number;
  percentage: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  mastery: MasteryLevel;
  masteryReasons: string[];
  /** أداء كل عائلة أسئلة (الإكمال، المتشابهات…). */
  byFamily: { family: string; correct: number; total: number; percentage: number }[];
  byDifficulty: { difficulty: Difficulty; correct: number; total: number }[];
  /** مواضع الخطأ: مقاطع قرآنية يُقترح مراجعتها. */
  weakSpots: {
    surah: number;
    surahName: string;
    fromAyah: number;
    toAyah: number;
    errors: number;
  }[];
  graded: GradedAnswer[];
  durationSeconds: number;
};

export const ENGINE_VERSION = "exam-engine/1.0.0";

/**
 * محاولة جديدة على لقطة اختبار.
 *
 * المعرّف محلي (`crypto.randomUUID`) حتى يعمل الاختبار دون اتصال، ويُستبدل
 * بمعرّف السحابة إن نجح الرفع.
 */
export function newAttempt(snapshot: ExamSnapshot): ExamAttempt {
  return {
    id: crypto.randomUUID(),
    examId: snapshot.id,
    startedAt: new Date().toISOString(),
    endedAt: null,
    status: "in_progress",
    currentIndex: 0,
    answers: {},
  };
}
