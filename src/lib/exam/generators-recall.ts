/**
 * مولّدات الاستظهار والترتيب (الأنواع 1–7): أكمل الآية، التالية/السابقة، ما بين الآيتين، الترتيب،
 * الآية ↔ السورة. القواعد الملزمة في رأس `generators.ts`.
 */

import type { Ayah } from "./corpus";
import { rulesFor } from "./difficulty";
import { scopeSurahs, surahName } from "./scope";
import { normalizeArabic, words } from "./text";
import type { QuestionOption, QuestionType } from "./types";
import {
  type GeneratorContext,
  type DraftQuestion,
  MIN_WORDS,
  relative,
  optionId,
  buildOptions,
  poolExcept,
  pickDistractors,
  ayahLabel,
  rangeLabel,
  signature,
  nextInScope,
  prevInScope,
} from "./generator-utils";

// ─────────────────────────── 1. أكمل الآية ───────────────────────────

export function generateCompleteAyah(ctx: GeneratorContext): DraftQuestion | null {
  const rules = rulesFor(ctx.difficulty);
  const candidates = ctx.pool.filter((a) => words(a.text).length >= MIN_WORDS + 2);
  if (!candidates.length) return null;
  const base = ctx.rng.pick(candidates);
  const w = words(base.text);

  const ratio =
    rules.hiddenRatio.min + ctx.rng.next() * (rules.hiddenRatio.max - rules.hiddenRatio.min);
  const hidden = Math.max(2, Math.round(w.length * ratio));
  const shownCount = Math.max(2, w.length - hidden);
  const shown = w.slice(0, shownCount).join(" ");
  const answer = w.slice(shownCount).join(" ");
  if (!answer || !shown) return null;

  // المشتتات: نهايات آيات أخرى من النطاق بطول مشابه.
  const others = poolExcept(ctx, [base]).filter((a) => words(a.text).length >= shownCount + 2);
  if (others.length < 2) return null;
  const { picked, achievableMax } = pickDistractors(ctx, answer, others, rules.optionCount - 1);
  if (picked.length < 2) return null;

  const distractors = picked.map((a) => {
    const aw = words(a.text);
    const tail = aw.slice(Math.max(0, aw.length - w.slice(shownCount).length)).join(" ");
    return { text: tail || aw.join(" "), ref: { surah: a.surah, ayah: a.ayah } };
  });
  // لا يجوز أن يتطابق مشتّت مع الإجابة نصاً.
  const unique = distractors.filter((d) => normalizeArabic(d.text) !== normalizeArabic(answer));
  if (unique.length < 2) return null;

  const { options, correctId, similarityScore } = buildOptions(
    ctx.rng,
    answer,
    { surah: base.surah, ayah: base.ayah },
    unique,
  );

  return {
    type: "complete_ayah",
    difficulty: ctx.difficulty,
    prompt: "أكمل الآية:",
    passage: `${shown} …`,
    answerShape: "single_choice",
    options,
    correct: correctId,
    refs: [{ surah: base.surah, ayah: base.ayah }, ...unique.map((d) => d.ref!)],
    reference: ayahLabel(base),
    validation: {
      distractorSimilarity: similarityScore,
      relativeSimilarity: relative(similarityScore, achievableMax),
      recallDistance: 1,
      rareWordFrequency: null,
      signature: signature("complete_ayah", [base.surah, base.ayah, shownCount]),
    },
  };
}

// ──────────────────── 2 و3. الآية التالية / السابقة ────────────────────

export function generateNeighbour(
  ctx: GeneratorContext,
  direction: "next" | "previous",
): DraftQuestion | null {
  const type: QuestionType = direction === "next" ? "next_ayah" : "previous_ayah";
  const rules = rulesFor(ctx.difficulty);
  const candidates = ctx.pool.filter((a) => {
    const target = direction === "next" ? nextInScope(ctx, a) : prevInScope(ctx, a);
    return !!target && words(a.text).length >= MIN_WORDS;
  });
  if (!candidates.length) return null;

  const base = ctx.rng.pick(candidates);
  const answer = direction === "next" ? nextInScope(ctx, base)! : prevInScope(ctx, base)!;
  const others = poolExcept(ctx, [base, answer]);
  if (others.length < 2) return null;
  const { picked, achievableMax } = pickDistractors(
    ctx,
    answer.text,
    others,
    rules.optionCount - 1,
  );
  if (picked.length < 2) return null;

  const { options, correctId, similarityScore } = buildOptions(
    ctx.rng,
    answer.text,
    { surah: answer.surah, ayah: answer.ayah },
    picked.map((a) => ({ text: a.text, ref: { surah: a.surah, ayah: a.ayah } })),
  );

  return {
    type,
    difficulty: ctx.difficulty,
    prompt: direction === "next" ? "ما الآية التي تليها؟" : "ما الآية التي قبلها؟",
    passage: base.text,
    answerShape: "single_choice",
    options,
    correct: correctId,
    refs: [
      { surah: base.surah, ayah: base.ayah },
      { surah: answer.surah, ayah: answer.ayah },
      ...picked.map((a) => ({ surah: a.surah, ayah: a.ayah })),
    ],
    reference: ayahLabel(answer),
    validation: {
      distractorSimilarity: similarityScore,
      relativeSimilarity: relative(similarityScore, achievableMax),
      recallDistance: 1,
      rareWordFrequency: null,
      signature: signature(type, [base.surah, base.ayah]),
    },
  };
}

// ─────────────────────── 4. ما بين الآيتين؟ ───────────────────────

export function generateMissingBetween(ctx: GeneratorContext): DraftQuestion | null {
  const rules = rulesFor(ctx.difficulty);
  const candidates = ctx.pool.filter((a) => {
    const mid = nextInScope(ctx, a);
    return !!mid && !!nextInScope(ctx, mid);
  });
  if (!candidates.length) return null;

  const first = ctx.rng.pick(candidates);
  const middle = nextInScope(ctx, first)!;
  const third = nextInScope(ctx, middle)!;
  const others = poolExcept(ctx, [first, middle, third]);
  if (others.length < 2) return null;
  const { picked, achievableMax } = pickDistractors(
    ctx,
    middle.text,
    others,
    rules.optionCount - 1,
  );
  if (picked.length < 2) return null;

  const { options, correctId, similarityScore } = buildOptions(
    ctx.rng,
    middle.text,
    { surah: middle.surah, ayah: middle.ayah },
    picked.map((a) => ({ text: a.text, ref: { surah: a.surah, ayah: a.ayah } })),
  );

  return {
    type: "missing_between",
    difficulty: ctx.difficulty,
    prompt: "ما الآية التي تأتي بين هاتين الآيتين؟",
    passage: `${first.text}\n\n﴿ … ﮐ … ﴾\n\n${third.text}`,
    answerShape: "single_choice",
    options,
    correct: correctId,
    refs: [first, middle, third, ...picked].map((a) => ({ surah: a.surah, ayah: a.ayah })),
    reference: ayahLabel(middle),
    validation: {
      distractorSimilarity: similarityScore,
      relativeSimilarity: relative(similarityScore, achievableMax),
      recallDistance: 2,
      rareWordFrequency: null,
      signature: signature("missing_between", [first.surah, first.ayah]),
    },
  };
}

// ────────────────────────── 5. ترتيب الآيات ──────────────────────────

export function generateOrdering(ctx: GeneratorContext): DraftQuestion | null {
  const size = ctx.difficulty === "mastery" ? 4 : 3;
  // مقاطع متصلة داخل النطاق فقط.
  const starts = ctx.pool.filter((a) => {
    let cur: Ayah | null = a;
    for (let i = 1; i < size; i += 1) {
      cur = cur ? nextInScope(ctx, cur) : null;
      if (!cur) return false;
    }
    return true;
  });
  if (!starts.length) return null;

  const start = ctx.rng.pick(starts);
  const sequence: Ayah[] = [start];
  for (let i = 1; i < size; i += 1) sequence.push(nextInScope(ctx, sequence[i - 1]!)!);

  const shuffled = ctx.rng.shuffle(sequence);
  // إن جاء الخلط بنفس الترتيب الصحيح، يُعاد الخلط مرة (حتمياً).
  const display = shuffled.every((a, i) => a.ayah === sequence[i]!.ayah)
    ? ctx.rng.shuffle(sequence)
    : shuffled;

  const options: QuestionOption[] = display.map((a, i) => ({
    id: optionId("o", i),
    text: a.text,
    ref: { surah: a.surah, ayah: a.ayah },
  }));
  const correct = sequence.map(
    (a) => options.find((o) => o.ref!.surah === a.surah && o.ref!.ayah === a.ayah)!.id,
  );

  return {
    type: "order_ayahs",
    difficulty: ctx.difficulty,
    prompt: "رتّب الآيات حسب ترتيبها في المصحف:",
    passage: null,
    answerShape: "ordering",
    options,
    correct,
    refs: sequence.map((a) => ({ surah: a.surah, ayah: a.ayah })),
    reference: rangeLabel(sequence[0]!, sequence[sequence.length - 1]!),
    validation: {
      distractorSimilarity: 0,
      relativeSimilarity: 1,
      recallDistance: size - 1,
      rareWordFrequency: null,
      signature: signature("order_ayahs", [start.surah, start.ayah, size]),
    },
  };
}

// ──────────────────── 6 و7. الآية ↔ السورة ────────────────────

export function generateAyahToSurah(ctx: GeneratorContext): DraftQuestion | null {
  const surahs = scopeSurahs(ctx.scope);
  // يحتاج ثلاث سور على الأقل داخل النطاق، وإلا فالخيارات ستخرج عن النطاق.
  if (surahs.length < 3) return null;
  const rules = rulesFor(ctx.difficulty);

  const base = ctx.rng.pick(ctx.pool.filter((a) => words(a.text).length >= MIN_WORDS));
  const otherSurahs = surahs.filter((s) => s !== base.surah);
  const optionCount = Math.min(rules.optionCount, otherSurahs.length + 1);
  const distractorSurahs = ctx.rng.sample(otherSurahs, optionCount - 1);
  if (distractorSurahs.length < 2) return null;

  const { options, correctId } = buildOptions(
    ctx.rng,
    surahName(base.surah),
    undefined,
    distractorSurahs.map((s) => ({ text: surahName(s) })),
  );

  return {
    type: "ayah_to_surah",
    difficulty: ctx.difficulty,
    prompt: "إلى أي سورة تنتمي هذه الآية؟",
    passage: base.text,
    answerShape: "single_choice",
    options,
    correct: correctId,
    refs: [{ surah: base.surah, ayah: base.ayah }],
    reference: ayahLabel(base),
    validation: {
      // المشتتات أسماء سور لا آيات، فلا معنى لقياس تشابه النص هنا.
      distractorSimilarity: (rules.distractorSimilarity.min + rules.distractorSimilarity.max) / 2,
      relativeSimilarity: 1,
      recallDistance: 1,
      rareWordFrequency: null,
      signature: signature("ayah_to_surah", [base.surah, base.ayah]),
    },
  };
}

export function generateSurahToAyah(ctx: GeneratorContext): DraftQuestion | null {
  const surahs = scopeSurahs(ctx.scope);
  if (surahs.length < 2) return null;
  const rules = rulesFor(ctx.difficulty);

  const target = ctx.rng.pick(surahs);
  const inTarget = ctx.pool.filter((a) => a.surah === target && words(a.text).length >= MIN_WORDS);
  const outside = ctx.pool.filter((a) => a.surah !== target && words(a.text).length >= MIN_WORDS);
  if (!inTarget.length || outside.length < 2) return null;

  const answer = ctx.rng.pick(inTarget);
  const { picked, achievableMax } = pickDistractors(
    ctx,
    answer.text,
    outside,
    rules.optionCount - 1,
  );
  if (picked.length < 2) return null;

  const { options, correctId, similarityScore } = buildOptions(
    ctx.rng,
    answer.text,
    { surah: answer.surah, ayah: answer.ayah },
    picked.map((a) => ({ text: a.text, ref: { surah: a.surah, ayah: a.ayah } })),
  );

  return {
    type: "surah_to_ayah",
    difficulty: ctx.difficulty,
    prompt: `أي هذه الآيات من سورة ${surahName(target)}؟`,
    passage: null,
    answerShape: "single_choice",
    options,
    correct: correctId,
    refs: [answer, ...picked].map((a) => ({ surah: a.surah, ayah: a.ayah })),
    reference: ayahLabel(answer),
    validation: {
      distractorSimilarity: similarityScore,
      relativeSimilarity: relative(similarityScore, achievableMax),
      recallDistance: 1,
      rareWordFrequency: null,
      signature: signature("surah_to_ayah", [target, answer.ayah]),
    },
  };
}
