// ============================================================
// Zen — Quran Module
// Arabic normalization tuned for the Uthmani script
// ------------------------------------------------------------
// Search must succeed regardless of tashkeel, hamza form,
// dagger alif, tatweel or the alif-wasla used by the Uthmani
// dataset. Word boundaries are preserved so a hit can be
// mapped back onto the original (fully vocalized) text.
// ============================================================

/** Harakat, small Quranic marks, superscript alif, tatweel. */
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08F0-\u08FF\u0640]/g;
const PUNCT = /[«»"'()[\]{}.,!?؟،؛:*\-_/\\|~^`]+/g;

/** Normalize a chunk of Arabic for comparison purposes. */
export function normalizeArabic(input: string): string {
  return input
    .replace(DIACRITICS, "")
    .replace(/[أإآٱٲٳٵ]/g, "ا")
    .replace(/[ىۍێ]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(PUNCT, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * هيكل الرسم للبحث: يوحّد الرسم العثماني والإملاء الحديث في صورة واحدة.
 *
 * الرسم العثماني يكتب «ٱلصَّلَوٰة» و«ٱلْكِتَٰب» و«إِبْرَٰهِـۧم» و«ٱلْقُرْءَان»
 * بينما يكتب المستخدم «الصلاة» و«الكتاب» و«إبراهيم» و«القرآن». الفرق
 * كله تقريباً في الألف والهمزة، فنحذفهما من الطرفين، ونعالج الواو
 * الصامتة قبل الألف الخنجرية، والياء والنون الصغيرتين، وصلة الضمير.
 * الكلمات تبقى منفصلة حتى تُطابق النتيجة على النص الأصلي.
 */
export function quranSkeleton(input: string): string {
  return (
    input
      .replace(/\uFEFF/g, "")
      // واو «الصلوٰة، الزكوٰة، الحيوٰة» تُقرأ ألفاً.
      .replace(/و\u0670/g, "")
      // صلة هاء الضمير «بِهِۦ، لَهُۥ» لا تُكتب في الإملاء.
      .replace(/(ه[\u064B-\u0652]*)(?:\u06E5|\u06E6)/g, "$1")
      // الياء الصغيرة «إِبْرَٰهِـۧم، إِۦلَٰفِ» والنون الصغيرة «نُۨجِى» حروف مقروءة.
      .replace(/\u06E6|\u06E7/g, "ي")
      .replace(/\u06E8/g, "ن")
      .replace(DIACRITICS, "")
      .replace(/[اأإآٱٲٳٵءؤئ]/g, "")
      .replace(/[ىۍێ]/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(PUNCT, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Split a query into meaningful skeleton tokens (single letters are noise). */
export function tokenizeArabic(query: string): string[] {
  return quranSkeleton(query)
    .split(" ")
    .filter((t) => t.length > 1);
}

/**
 * Original words plus two normalized twins: the rasm skeleton used for
 * matching, and a lighter normalization used to rank exact spellings.
 */
export function splitWords(text: string): { words: string[]; norm: string[]; light: string[] } {
  const words = text.split(/\s+/).filter(Boolean);
  return {
    words,
    norm: words.map((w) => quranSkeleton(w)),
    light: words.map((w) => normalizeArabic(w)),
  };
}

/** السوابق المسموح بها قبل الكلمة: و/ف ثم ب/ك/ل/س ثم لام التعريف (بعد حذف الألف). */
const PROCLITICS = /^(?:[وف]?[بكلس]?ل?)$/;

/**
 * Does a skeleton word contain the token as a word (optionally prefixed by
 * و، ف، ب، ك، ل، س، الـ and followed by any suffix)? This keeps «فَلِلَّهِ»
 * and «وَبِٱلْءَاخِرَةِ» searchable without matching the token in the
 * middle of an unrelated word («رحمة» for «مئة»).
 */
export function wordMatchesToken(word: string, token: string): boolean {
  let from = 0;
  while (from <= word.length - token.length) {
    const i = word.indexOf(token, from);
    if (i < 0) return false;
    if (i <= 3 && PROCLITICS.test(word.slice(0, i))) return true;
    from = i + 1;
  }
  return false;
}

/** Indices of the words that match any of the tokens. */
export function matchedWordIndices(normWords: string[], tokens: string[]): number[] {
  if (!tokens.length) return [];
  const out: number[] = [];
  for (let i = 0; i < normWords.length; i++) {
    if (tokens.some((t) => wordMatchesToken(normWords[i], t))) out.push(i);
  }
  return out;
}

/** True when every token is present somewhere in the normalized haystack. */
export function containsAllTokens(hay: string, tokens: string[]): boolean {
  for (const t of tokens) if (!hay.includes(t)) return false;
  return true;
}
