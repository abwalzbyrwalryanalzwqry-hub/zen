/**
 * مولّدات الأسئلة.
 *
 * قواعد ملزمة على كل مولّد:
 *  1. كل نص معروض (سؤال، خيار، إجابة) مأخوذ حرفياً من المتن المرجعي — لا يُولَّد
 *     نص قرآني ولا يُعاد صياغته. الاستثناء الوحيد هو سؤال «اكتشف الخطأ»، وفيه
 *     يُبدَّل/يُحذف كلمة **من المتن نفسه** بطريقة محفوظة في بيانات السؤال، فالخطأ
 *     قابل للتحقق آلياً وليس نصاً مصطنعاً.
 *  2. كل مرجع يُسجَّل في `refs` ليمر على مدقّق النطاق.
 *  3. المشتتات من داخل النطاق فقط؛ وإن لم تتوفر، يُعيد المولّد null ولا يخرج
 *     من النطاق للحصول على سؤال.
 *  4. أسماء السور تُعرض، وأرقامها داخلية فقط.
 */

import type { QuestionType } from "./types";
import { type GeneratorContext, type DraftQuestion } from "./generator-utils";
import {
  generateAyahToSurah,
  generateCompleteAyah,
  generateMissingBetween,
  generateNeighbour,
  generateOrdering,
  generateSurahToAyah,
} from "./generators-recall";
import {
  generateDiffTwoAyahs,
  generateRareWord,
  generateSimilarPlace,
  generateSpotTheError,
} from "./generators-precision";
export type { DraftQuestion, GeneratorContext } from "./generator-utils";

/** خريطة المولّدات — مصدر الحقيقة لما يدعمه المحرّك. */
export const GENERATORS: Record<QuestionType, (ctx: GeneratorContext) => DraftQuestion | null> = {
  complete_ayah: generateCompleteAyah,
  next_ayah: (ctx) => generateNeighbour(ctx, "next"),
  previous_ayah: (ctx) => generateNeighbour(ctx, "previous"),
  missing_between: generateMissingBetween,
  order_ayahs: generateOrdering,
  ayah_to_surah: generateAyahToSurah,
  surah_to_ayah: generateSurahToAyah,
  rare_word_to_surah: (ctx) => generateRareWord(ctx, "surah"),
  rare_word_to_ayah: (ctx) => generateRareWord(ctx, "ayah"),
  similar_ayah_place: generateSimilarPlace,
  diff_two_ayahs: generateDiffTwoAyahs,
  spot_the_error: generateSpotTheError,
};
