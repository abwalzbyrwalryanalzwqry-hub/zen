/**
 * أدوات مشتركة لمولّدات الأسئلة (M5): السياق، وبناء الخيارات، واختيار المشتتات من داخل النطاق، والوسوم.
 * القواعد الملزمة على كل مولّد في رأس `generators.ts`.
 */

import type { AyahRef, Ayah, QuranCorpus } from "./corpus";
import { rulesFor } from "./difficulty";
import type { Rng } from "./random";
import { isInScope, surahName, type ExamScope } from "./scope";
import { similarity, wordSimilarity } from "./text";
import type { Difficulty, ExamQuestion, QuestionOption, QuestionType } from "./types";

export type GeneratorContext = {
  corpus: QuranCorpus;
  scope: ExamScope;
  difficulty: Difficulty;
  rng: Rng;
  /** كل آيات النطاق (مرتّبة بترتيب المصحف). */
  pool: readonly Ayah[];
  /**
   * تخزين مؤقت للفهارس الثقيلة (أزواج المتشابهات، الكلمات النادرة) داخل بناء
   * اختبار واحد. بناؤها لكل محاولة توليد يعني إعادة مسح النطاق كله عشرات المرات.
   */
  memo: Map<string, unknown>;
};

export function memoize<T>(ctx: GeneratorContext, key: string, build: () => T): T {
  const hit = ctx.memo.get(key);
  if (hit !== undefined) return hit as T;
  const value = build();
  ctx.memo.set(key, value);
  return value;
}

/** سؤال قبل ترقيمه — المولّد لا يعرف موضعه في الاختبار. */
export type DraftQuestion = Omit<ExamQuestion, "id" | "index">;

export const MIN_WORDS = 4;

/**
 * قرب المشتتات المختارة من أقصى قرب متاح في النطاق (0..1).
 *
 * الصعوبة تُقاس نسبةً إلى ما يوفّره النطاق فعلاً: نطاق قصير قد لا يحتوي آيات
 * شديدة التشابه، ورفض السؤال لأن رقماً مطلقاً لم يتحقق يعني تعطيل المستويات
 * العليا في معظم النطاقات. أما اختيار أبعد المشتتات ووسمه «متقن» فهو الغش
 * الذي يمنعه هذا القياس.
 */
export function relative(chosen: number, achievableMax: number): number {
  if (achievableMax <= 0) return 1;
  return Math.min(1, chosen / achievableMax);
}

export function optionId(prefix: string, i: number): string {
  return `${prefix}${i}`;
}

/** يبني خيارات مخلوطة ويعيد معرّف الإجابة الصحيحة. */
export function buildOptions(
  rng: Rng,
  correctText: string,
  correctRef: AyahRef | undefined,
  distractors: { text: string; ref?: AyahRef }[],
): { options: QuestionOption[]; correctId: string; similarityScore: number } {
  const entries = [{ text: correctText, ref: correctRef, correct: true }].concat(
    distractors.map((d) => ({ text: d.text, ref: d.ref, correct: false })),
  );
  const shuffled = rng.shuffle(entries);
  const options: QuestionOption[] = shuffled.map((entry, i) => ({
    id: optionId("o", i),
    text: entry.text,
    ...(entry.ref ? { ref: entry.ref } : {}),
  }));
  const correctIndex = shuffled.findIndex((e) => e.correct);
  const similarityScore = distractors.length
    ? Math.max(...distractors.map((d) => similarity(correctText, d.text)))
    : 0;
  return { options, correctId: options[correctIndex]!.id, similarityScore };
}

/** آيات النطاق ما عدا آية معيّنة — مصدر المشتتات. */
export function poolExcept(ctx: GeneratorContext, exclude: readonly AyahRef[]): Ayah[] {
  const keys = new Set(exclude.map((r) => `${r.surah}:${r.ayah}`));
  return ctx.pool.filter((a) => !keys.has(`${a.surah}:${a.ayah}`));
}

/** نتيجة اختيار المشتتات: المختارة، وأقصى تشابه متاح في هذا النطاق. */
export type DistractorPick = {
  picked: Ayah[];
  /** أقصى تشابه ممكن داخل النطاق — أساس قياس الصعوبة النسبية. */
  achievableMax: number;
};

/**
 * يختار مشتتات بتشابه مناسب لمستوى الصعوبة.
 *
 * التصفية على مرحلتين للأداء: تشابه الكلمات (مجموعات، رخيص) على كل المرشحين،
 * ثم التشابه المركّب (يحسب مسافة تحرير) على الأربعين الأقرب فقط. حساب المسافة
 * المحرفية على 900 آية في كل محاولة توليد كان يكلّف ثوانيَ لكل سؤال.
 *
 * والهدف يتغيّر بالمستوى: «سهل» يطلب أبعد المشتتات، و«صعب/متقن» أقربها فعلياً
 * داخل النطاق — لا رقماً مطلقاً قد لا يوفّره نطاق ضيق.
 */
export function pickDistractors(
  ctx: GeneratorContext,
  correctText: string,
  candidates: readonly Ayah[],
  count: number,
): DistractorPick {
  const rules = rulesFor(ctx.difficulty);
  const cheap = candidates
    .map((a) => ({ a, s: wordSimilarity(correctText, a.text) }))
    .sort((x, y) => y.s - x.s);

  // الأقرب كلمياً + عيّنة من البقية، حتى تبقى الخيارات متنوعة لا متطابقة دائماً.
  const head = cheap.slice(0, 40).map((x) => x.a);
  const tail = ctx.rng.sample(
    cheap.slice(40).map((x) => x.a),
    30,
  );
  const scored = [...head, ...tail]
    .map((a) => ({ a, s: similarity(correctText, a.text) }))
    .filter(({ s }) => s < 0.995);
  if (!scored.length) return { picked: [], achievableMax: 0 };

  const achievableMax = Math.max(...scored.map((x) => x.s));
  const wantsClose = ctx.difficulty === "hard" || ctx.difficulty === "mastery";
  const sorted = wantsClose
    ? scored.sort((x, y) => y.s - x.s)
    : ctx.difficulty === "easy"
      ? scored.sort((x, y) => x.s - y.s)
      : scored.sort((x, y) => {
          const target = (rules.distractorSimilarity.min + rules.distractorSimilarity.max) / 2;
          return Math.abs(x.s - target) - Math.abs(y.s - target);
        });

  const window = sorted.slice(0, Math.max(count * 3, count + 2)).map((x) => x.a);
  return { picked: ctx.rng.sample(window, count), achievableMax };
}

export function ayahLabel(ref: AyahRef): string {
  return `سورة ${surahName(ref.surah)} · الآية ${ref.ayah}`;
}

export function rangeLabel(from: AyahRef, to: AyahRef): string {
  return `سورة ${surahName(from.surah)} · الآيات ${from.ayah}–${to.ayah}`;
}

export function signature(type: QuestionType, parts: (string | number)[]): string {
  return [type, ...parts].join("|");
}

/** الآية التالية داخل النطاق (أو null إذا كانت خارجه). */
export function nextInScope(ctx: GeneratorContext, ref: AyahRef): Ayah | null {
  if (!isInScope(ctx.scope, ref.surah, ref.ayah + 1)) return null;
  return ctx.corpus.ayah(ref.surah, ref.ayah + 1);
}

export function prevInScope(ctx: GeneratorContext, ref: AyahRef): Ayah | null {
  if (!isInScope(ctx.scope, ref.surah, ref.ayah - 1)) return null;
  return ctx.corpus.ayah(ref.surah, ref.ayah - 1);
}
