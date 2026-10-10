/**
 * قواعد الصعوبة الفعلية — لا مجرد وسم.
 *
 * لكل مستوى قيود قابلة للقياس على السؤال المولَّد:
 *  - `distractorSimilarity`: تشابه المشتتات مع الإجابة الصحيحة (0..1). المشتّت
 *    البعيد يجعل السؤال سهلاً، والمشتّت شديد القرب يجعله متقناً.
 *  - `recallDistance`: مسافة الاستدعاء — كم آية بين المعطى والمطلوب، أو كم كلمة
 *    حُجبت. الاستدعاء البعيد أصعب.
 *  - `rareWordFrequency`: تواتر الكلمة في المصحف كله لأسئلة الكلمات. كلمة وردت
 *    مرة واحدة أصعب بكثير من كلمة وردت مئة مرة.
 *  - `types`: أنواع مسموحة لكل مستوى (المتشابهات الشديدة لا تُعطى في «سهل»).
 * والمدقّق يرفض أي سؤال يخرج عن نطاق مستواه بدل قبوله بوسم خاطئ.
 */

import type { Difficulty, ExamQuestion, QuestionType } from "./types";

export type DifficultyRules = {
  /** المجال المسموح لتشابه أقرب مشتّت مع الإجابة (قياس مطلق). */
  distractorSimilarity: { min: number; max: number };
  /**
   * القياس النسبي: كم يقترب المشتّت المختار من أقصى تشابه متاح داخل النطاق.
   * «متقن» يشترط اختيار أقرب ما يوفّره النطاق، و«سهل» يشترط أبعده.
   */
  relativeSimilarity: { min: number; max: number };
  /** عدد الخيارات المعروضة. */
  optionCount: number;
  /** مجال مسافة الاستدعاء. */
  recallDistance: { min: number; max: number };
  /** الحد الأعلى لتواتر الكلمة في أسئلة الكلمات النادرة. */
  maxRareFrequency: number;
  /** أنواع الأسئلة المسموحة في هذا المستوى. */
  allowedTypes: readonly QuestionType[];
  /** نسبة حجب الكلمات في «أكمل الآية». */
  hiddenRatio: { min: number; max: number };
};

const EASY_TYPES: QuestionType[] = ["complete_ayah", "next_ayah", "ayah_to_surah", "surah_to_ayah"];

const MEDIUM_TYPES: QuestionType[] = [
  ...EASY_TYPES,
  "previous_ayah",
  "missing_between",
  "order_ayahs",
  "rare_word_to_surah",
];

const HARD_TYPES: QuestionType[] = [
  ...MEDIUM_TYPES,
  "rare_word_to_ayah",
  "similar_ayah_place",
  "spot_the_error",
];

const MASTERY_TYPES: QuestionType[] = [...HARD_TYPES, "diff_two_ayahs"];

export const DIFFICULTY_RULES: Record<Difficulty, DifficultyRules> = {
  easy: {
    relativeSimilarity: { min: 0, max: 0.55 },
    distractorSimilarity: { min: 0, max: 0.45 },
    optionCount: 4,
    recallDistance: { min: 1, max: 1 },
    maxRareFrequency: 40,
    allowedTypes: EASY_TYPES,
    hiddenRatio: { min: 0.3, max: 0.5 },
  },
  medium: {
    relativeSimilarity: { min: 0.3, max: 0.85 },
    distractorSimilarity: { min: 0.2, max: 0.62 },
    optionCount: 4,
    recallDistance: { min: 1, max: 2 },
    maxRareFrequency: 15,
    allowedTypes: MEDIUM_TYPES,
    hiddenRatio: { min: 0.4, max: 0.6 },
  },
  hard: {
    relativeSimilarity: { min: 0.65, max: 1 },
    distractorSimilarity: { min: 0.4, max: 0.82 },
    optionCount: 4,
    recallDistance: { min: 1, max: 3 },
    maxRareFrequency: 6,
    allowedTypes: HARD_TYPES,
    hiddenRatio: { min: 0.5, max: 0.7 },
  },
  mastery: {
    relativeSimilarity: { min: 0.8, max: 1 },
    distractorSimilarity: { min: 0.55, max: 0.97 },
    optionCount: 5,
    recallDistance: { min: 2, max: 4 },
    maxRareFrequency: 3,
    allowedTypes: MASTERY_TYPES,
    hiddenRatio: { min: 0.6, max: 0.8 },
  },
};

export function rulesFor(difficulty: Difficulty): DifficultyRules {
  return DIFFICULTY_RULES[difficulty];
}

export function typeAllowed(type: QuestionType, difficulty: Difficulty): boolean {
  return DIFFICULTY_RULES[difficulty].allowedTypes.includes(type);
}

export type DifficultyCheck = { ok: boolean; reasons: string[] };

/**
 * يتحقق أن السؤال يستحق مستواه فعلاً. هامش تسامح صغير على حدود التشابه لأن
 * النطاق الضيق قد لا يوفّر مشتتاً بالقرب المطلوب بالضبط — لكن الخروج الكبير
 * يُرفض بدل أن يُعطى الطالب سؤالاً سهلاً موسوماً «متقن».
 */
export function checkDifficulty(question: ExamQuestion): DifficultyCheck {
  const rules = rulesFor(question.difficulty);
  const reasons: string[] = [];
  const { distractorSimilarity, relativeSimilarity, recallDistance, rareWordFrequency } =
    question.validation;
  const tolerance = 0.12;

  if (!typeAllowed(question.type, question.difficulty)) {
    reasons.push(`النوع ${question.type} غير مسموح في مستوى ${question.difficulty}`);
  }
  if (question.answerShape === "single_choice") {
    if (distractorSimilarity > rules.distractorSimilarity.max + tolerance) {
      reasons.push("المشتتات أقرب مما يسمح به المستوى (سؤال أصعب من وسمه)");
    }
    // المعيارَان بديلان لا تراكميان: يكفي أن يكون المشتّت **قريباً فعلاً**
    // (قياس مطلق) أو أن يكون **أقرب ما يوفّره النطاق** (قياس نسبي).
    //
    // السبب: نطاق متجانس قد تكون كل آياته متباعدة (فأقصى تشابه متاح 0.35)؛
    // فطلب نسبة عالية فيه تعسّف، كما أن طلب نسبة منخفضة في نطاق متقارب تعسّف
    // بالعكس. والغرض أن يُمنع الغش: أن يُختار أبعد مشتّت ثم يُوسم السؤال «متقن».
    const closeEnough =
      relativeSimilarity >= rules.relativeSimilarity.min - 0.05 ||
      distractorSimilarity >= rules.distractorSimilarity.min;
    const farEnough =
      relativeSimilarity <= rules.relativeSimilarity.max + 0.05 ||
      distractorSimilarity <= rules.distractorSimilarity.max;

    if (!closeEnough) {
      reasons.push("المشتتات أبعد مما يسمح به المستوى (سؤال أسهل من وسمه)");
    }
    if (!farEnough) {
      reasons.push("المشتتات أقرب مما يسمح به المستوى (سؤال أصعب من وسمه)");
    }
    if (question.options.length < Math.min(3, rules.optionCount)) {
      reasons.push("عدد الخيارات أقل من الحد الأدنى");
    }
  }
  if (recallDistance > rules.recallDistance.max) {
    reasons.push("مسافة الاستدعاء أكبر من حد المستوى");
  }
  if (rareWordFrequency != null && rareWordFrequency > rules.maxRareFrequency) {
    reasons.push("الكلمة أكثر تواتراً مما يسمح به المستوى");
  }

  return { ok: reasons.length === 0, reasons };
}
