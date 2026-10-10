/**
 * مولّدات الدقّة (الأنواع 8–12): الكلمات النادرة، والمتشابهات، والفرق بين آيتين، واكتشف الخطأ.
 * القواعد الملزمة في رأس `generators.ts`.
 */

import type { Ayah } from "./corpus";
import { rareWordsIn } from "./corpus";
import { rulesFor } from "./difficulty";
import { isInScope, scopeSurahs, surahName } from "./scope";
import { firstWordDifference, normalizeArabic, words } from "./text";
import type { QuestionOption, QuestionType } from "./types";
import {
  type GeneratorContext,
  memoize,
  type DraftQuestion,
  MIN_WORDS,
  relative,
  optionId,
  buildOptions,
  poolExcept,
  pickDistractors,
  ayahLabel,
  signature,
} from "./generator-utils";

// ──────────────────── 8 و9. الكلمات النادرة ────────────────────

export function generateRareWord(
  ctx: GeneratorContext,
  target: "surah" | "ayah",
): DraftQuestion | null {
  const type: QuestionType = target === "surah" ? "rare_word_to_surah" : "rare_word_to_ayah";
  const rules = rulesFor(ctx.difficulty);
  // الكلمات النادرة القابلة للاستخدام تُحسب مرة واحدة لكل نطاق/هدف.
  const usable = memoize(ctx, `rare:${target}:${rules.maxRareFrequency}`, () => {
    const refs = ctx.pool.map((a) => ({ surah: a.surah, ayah: a.ayah }));
    const rare = rareWordsIn(ctx.corpus, refs, rules.maxRareFrequency);
    // فهرس عكسي: كلمة ← الآيات التي تحملها داخل النطاق (مسح واحد للنطاق).
    const holders = new Map<string, Ayah[]>();
    const wanted = new Set(rare.map((r) => r.word));
    for (const a of ctx.pool) {
      for (const w of ctx.corpus.wordsOf(a)) {
        if (!wanted.has(w)) continue;
        const list = holders.get(w);
        if (list) list.push(a);
        else holders.set(w, [a]);
      }
    }
    // كلمة نادرة ترد في موضع واحد داخل النطاق (وإلا صار للسؤال أكثر من جواب).
    return rare.filter((entry) => {
      const list = holders.get(entry.word) ?? [];
      return target === "surah" ? new Set(list.map((h) => h.surah)).size === 1 : list.length === 1;
    });
  });
  if (!usable.length) return null;

  const chosen = ctx.rng.pick(usable);
  const holder = ctx.corpus.ayah(chosen.ref.surah, chosen.ref.ayah);
  if (!holder) return null;
  // الكلمة تُعرض بتشكيلها الأصلي من المتن.
  const originalWord =
    holder.text.split(" ").find((w) => normalizeArabic(w) === chosen.word) ?? chosen.word;

  if (target === "surah") {
    const surahs = scopeSurahs(ctx.scope).filter((s) => s !== holder.surah);
    if (surahs.length < 2) return null;
    const picked = ctx.rng.sample(surahs, Math.min(rules.optionCount - 1, surahs.length));
    const { options, correctId } = buildOptions(
      ctx.rng,
      surahName(holder.surah),
      undefined,
      picked.map((s) => ({ text: surahName(s) })),
    );
    return {
      type,
      difficulty: ctx.difficulty,
      prompt: `في أي سورة وردت هذه الكلمة؟`,
      passage: originalWord,
      answerShape: "single_choice",
      options,
      correct: correctId,
      refs: [{ surah: holder.surah, ayah: holder.ayah }],
      reference: ayahLabel(holder),
      validation: {
        distractorSimilarity: (rules.distractorSimilarity.min + rules.distractorSimilarity.max) / 2,
        relativeSimilarity: 1,
        recallDistance: 1,
        rareWordFrequency: chosen.frequency,
        signature: signature(type, [chosen.word]),
      },
    };
  }

  const others = poolExcept(ctx, [holder]);
  if (others.length < 2) return null;
  const { picked, achievableMax } = pickDistractors(
    ctx,
    holder.text,
    others,
    rules.optionCount - 1,
  );
  if (picked.length < 2) return null;
  const { options, correctId, similarityScore } = buildOptions(
    ctx.rng,
    holder.text,
    { surah: holder.surah, ayah: holder.ayah },
    picked.map((a) => ({ text: a.text, ref: { surah: a.surah, ayah: a.ayah } })),
  );
  return {
    type,
    difficulty: ctx.difficulty,
    prompt: `في أي آية وردت كلمة «${originalWord}»؟`,
    passage: null,
    answerShape: "single_choice",
    options,
    correct: correctId,
    refs: [holder, ...picked].map((a) => ({ surah: a.surah, ayah: a.ayah })),
    reference: ayahLabel(holder),
    validation: {
      distractorSimilarity: similarityScore,
      relativeSimilarity: relative(similarityScore, achievableMax),
      recallDistance: 1,
      rareWordFrequency: chosen.frequency,
      signature: signature(type, [chosen.word, holder.surah, holder.ayah]),
    },
  };
}

// ──────────────────── 10 و11. المتشابهات ────────────────────

/** آيات النطاق التي لها شبيه داخل النطاق. */
function similarPairsInScope(
  ctx: GeneratorContext,
  minScore: number,
): { base: Ayah; twin: Ayah; score: number }[] {
  return memoize(ctx, `pairs:${minScore}`, () => computeSimilarPairs(ctx, minScore));
}

function computeSimilarPairs(
  ctx: GeneratorContext,
  minScore: number,
): { base: Ayah; twin: Ayah; score: number }[] {
  const out: { base: Ayah; twin: Ayah; score: number }[] = [];
  for (const a of ctx.pool) {
    for (const { ref, score } of ctx.corpus.similarTo({ surah: a.surah, ayah: a.ayah }, minScore)) {
      if (!isInScope(ctx.scope, ref.surah, ref.ayah)) continue;
      const twin = ctx.corpus.ayah(ref.surah, ref.ayah);
      if (!twin) continue;
      // زوج واحد لكل اتجاه.
      if (a.surah > twin.surah || (a.surah === twin.surah && a.ayah > twin.ayah)) continue;
      out.push({ base: a, twin, score });
    }
  }
  return out;
}

export function generateSimilarPlace(ctx: GeneratorContext): DraftQuestion | null {
  const rules = rulesFor(ctx.difficulty);
  const pairs = similarPairsInScope(ctx, 0.6);
  if (!pairs.length) return null;

  const pair = ctx.rng.pick(pairs);
  // السؤال: هذه الآية بهذا اللفظ — في أي موضع وردت؟ الموضعان المتشابهان أساس
  // السؤال، ويُضاف إليهما مواضع مجاورة **من داخل النطاق** حتى تكون الخيارات
  // ثلاثة على الأقل وتظل كلها محتملة لقارئ لم يتقن التفريق.
  const answer = ctx.rng.pick([pair.base, pair.twin]);
  const other = answer === pair.base ? pair.twin : pair.base;

  const neighbours: Ayah[] = [];
  for (const offset of [1, -1, 2, -2, 3]) {
    for (const anchor of [other, answer]) {
      if (neighbours.length >= 3) break;
      const candidate = ctx.corpus.ayah(anchor.surah, anchor.ayah + offset);
      if (!candidate) continue;
      if (!isInScope(ctx.scope, candidate.surah, candidate.ayah)) continue;
      const isBase = candidate.surah === answer.surah && candidate.ayah === answer.ayah;
      const isTwin = candidate.surah === other.surah && candidate.ayah === other.ayah;
      if (isBase || isTwin) continue;
      if (neighbours.some((n) => n.surah === candidate.surah && n.ayah === candidate.ayah))
        continue;
      neighbours.push(candidate);
    }
  }

  const positions = [answer, other, ...neighbours].slice(0, rulesFor(ctx.difficulty).optionCount);
  if (positions.length < 3) return null;

  const options: QuestionOption[] = ctx.rng.shuffle(positions).map((a, i) => ({
    id: optionId("o", i),
    text: `سورة ${surahName(a.surah)} · الآية ${a.ayah}`,
    ref: { surah: a.surah, ayah: a.ayah },
  }));
  const correctOption = options.find(
    (o) => o.ref!.surah === answer.surah && o.ref!.ayah === answer.ayah,
  )!;

  return {
    type: "similar_ayah_place",
    difficulty: ctx.difficulty,
    prompt: "هذه الآية من المتشابهات — أي موضع هو موضعها بهذا اللفظ بالتحديد؟",
    passage: answer.text,
    answerShape: "single_choice",
    options,
    correct: correctOption.id,
    refs: positions.map((a) => ({ surah: a.surah, ayah: a.ayah })),
    reference: ayahLabel(answer),
    validation: {
      distractorSimilarity: Math.min(pair.score, rules.distractorSimilarity.max),
      relativeSimilarity: 1,
      recallDistance: 1,
      rareWordFrequency: null,
      signature: signature("similar_ayah_place", [
        answer.surah,
        answer.ayah,
        other.surah,
        other.ayah,
      ]),
    },
  };
}

export function generateDiffTwoAyahs(ctx: GeneratorContext): DraftQuestion | null {
  const pairs = similarPairsInScope(ctx, 0.75);
  if (!pairs.length) return null;

  // زوج يفترق بكلمة واحدة على الأقل وله فرق واضح قابل للسؤال.
  const usable = pairs
    .map((p) => ({ ...p, diff: firstWordDifference(p.base.text, p.twin.text) }))
    .filter((p) => p.diff.index >= 0 && p.diff.left && p.diff.right);
  if (!usable.length) return null;

  const pair = ctx.rng.pick(usable);
  const correctText = pair.diff.left!;
  // المشتتات: كلمات أخرى من الآية نفسها (كلها من المتن، وكلها داخل النطاق).
  const sameAyahWords = words(pair.base.text).filter(
    (w) => normalizeArabic(w) !== normalizeArabic(correctText) && w.length > 2,
  );
  if (sameAyahWords.length < 2) return null;
  const picked = ctx.rng.sample([...new Set(sameAyahWords)], 3);
  if (picked.length < 2) return null;

  const { options, correctId, similarityScore } = buildOptions(
    ctx.rng,
    correctText,
    { surah: pair.base.surah, ayah: pair.base.ayah },
    picked.map((w) => ({ text: w })),
  );

  return {
    type: "diff_two_ayahs",
    difficulty: ctx.difficulty,
    prompt: "ما الكلمة التي تفرّق بين الآيتين (كما وردت في الأولى)؟",
    passage: `١) ${pair.base.text}\n\n٢) ${pair.twin.text}`,
    answerShape: "single_choice",
    options,
    correct: correctId,
    refs: [pair.base, pair.twin].map((a) => ({ surah: a.surah, ayah: a.ayah })),
    reference: `${ayahLabel(pair.base)} · ${ayahLabel(pair.twin)}`,
    validation: {
      distractorSimilarity: Math.max(similarityScore, pair.score * 0.9),
      relativeSimilarity: 1,
      recallDistance: 1,
      rareWordFrequency: null,
      signature: signature("diff_two_ayahs", [pair.base.surah, pair.base.ayah, pair.twin.ayah]),
    },
  };
}

// ──────────────────────── 12. اكتشف الخطأ ────────────────────────

/**
 * يُنشئ نسخة محرَّفة من الآية بإحدى ثلاث عمليات محفوظة: تبديل كلمة بكلمة أخرى
 * **من داخل النطاق**، أو حذف كلمة، أو تكرار كلمة. لا يُولَّد حرف واحد من خارج
 * المتن، والعملية تُسجَّل في بيانات السؤال فيمكن التحقق منها آلياً.
 */
export function generateSpotTheError(ctx: GeneratorContext): DraftQuestion | null {
  const rules = rulesFor(ctx.difficulty);
  const candidates = ctx.pool.filter((a) => words(a.text).length >= MIN_WORDS + 2);
  if (candidates.length < 2) return null;

  const base = ctx.rng.pick(candidates);
  const baseWords = words(base.text);
  const donor = ctx.rng.pick(poolExcept(ctx, [base]));
  const donorWords = words(donor.text).filter((w) => w.length > 2);
  if (!donorWords.length) return null;

  const position = 1 + ctx.rng.int(baseWords.length - 2);
  const mode = ctx.rng.pick(["swap", "omit", "duplicate"] as const);
  const altered = [...baseWords];
  if (mode === "swap") altered[position] = ctx.rng.pick(donorWords);
  else if (mode === "omit") altered.splice(position, 1);
  else altered.splice(position, 0, altered[position]!);

  const alteredText = altered.join(" ");
  if (normalizeArabic(alteredText) === normalizeArabic(base.text)) return null;

  // مشتتات: نسخ صحيحة من آيات أخرى في النطاق (فالمطلوب تمييز المحرَّفة).
  const { picked: others, achievableMax } = pickDistractors(
    ctx,
    base.text,
    poolExcept(ctx, [base, donor]),
    rules.optionCount - 1,
  );
  if (others.length < 2) return null;

  const { options, correctId, similarityScore } = buildOptions(
    ctx.rng,
    alteredText,
    { surah: base.surah, ayah: base.ayah },
    others.map((a) => ({ text: a.text, ref: { surah: a.surah, ayah: a.ayah } })),
  );

  return {
    type: "spot_the_error",
    difficulty: ctx.difficulty,
    prompt: "أي النصوص التالية فيه خطأ مخالف للمصحف؟",
    passage: null,
    answerShape: "single_choice",
    options,
    correct: correctId,
    refs: [base, donor, ...others].map((a) => ({ surah: a.surah, ayah: a.ayah })),
    reference: `الصواب: ${base.text} — ${ayahLabel(base)}`,
    validation: {
      distractorSimilarity: similarityScore,
      relativeSimilarity: relative(similarityScore, achievableMax),
      recallDistance: 1,
      rareWordFrequency: null,
      signature: signature("spot_the_error", [base.surah, base.ayah, mode, position]),
    },
  };
}
