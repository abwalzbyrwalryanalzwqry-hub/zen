/**
 * معالجة النص القرآني للمقارنة والتوليد.
 *
 * قاعدة صارمة: كل نص يُعرض للمستخدم يأتي حرفياً من ملف البيانات المرجعي. الدوال
 * هنا تُطبّع النص **للمقارنة فقط** (تصحيح الإجابات، قياس التشابه، فهرسة الكلمات)،
 * ولا تُستخدم مخرجاتها كنص معروض أبداً.
 */

/** التشكيل وعلامات الوقف والتطويل — تُحذف عند التطبيع للمقارنة. */
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

const LETTER_FOLDS: ReadonlyArray<readonly [string, string]> = [
  ["\u0671", "ا"], // ألف وصل
  ["\u0622", "ا"], // آ
  ["\u0623", "ا"], // أ
  ["\u0625", "ا"], // إ
  ["\u0649", "ي"], // ى
  ["\u0629", "ه"], // ة
  ["\u06CC", "ي"],
];

/** تطبيع للمقارنة: حذف التشكيل وتوحيد الألفات والياء والتاء المربوطة. */
export function normalizeArabic(text: string): string {
  let t = text.replace(DIACRITICS, "");
  for (const [from, to] of LETTER_FOLDS) t = t.replaceAll(from, to);
  return t
    .replace(/[^\u0621-\u064A\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** كلمات النص الأصلي (بتشكيلها) — تُستخدم لبناء مقاطع تُعرض كما هي. */
export function words(text: string): string[] {
  return text.split(" ").filter(Boolean);
}

/** كلمات مطبَّعة للمقارنة والفهرسة. */
export function normalizedWords(text: string): string[] {
  const n = normalizeArabic(text);
  return n ? n.split(" ") : [];
}

/** مسافة ليفنشتاين على مستوى المحارف (محدودة لأداء مقبول). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** تشابه محرفي بين 0 و1 على النص المطبَّع. */
export function charSimilarity(a: string, b: string): number {
  const na = normalizeArabic(a);
  const nb = normalizeArabic(b);
  if (!na && !nb) return 1;
  const longest = Math.max(na.length, nb.length);
  if (longest === 0) return 1;
  return 1 - editDistance(na, nb) / longest;
}

/** تشابه على مستوى الكلمات (جاكارد) — أسرع من المحارف ويكفي للعنقدة. */
export function wordSimilarity(a: string, b: string): number {
  const sa = new Set(normalizedWords(a));
  const sb = new Set(normalizedWords(b));
  if (!sa.size && !sb.size) return 1;
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared += 1;
  return shared / (sa.size + sb.size - shared);
}

/**
 * تشابه مركّب يُستخدم لاختيار المشتتات وتصنيف الصعوبة: يخلط تشابه الكلمات
 * بالتشابه المحرفي حتى لا تُعتبر آيتان متشابهتين لمجرد اشتراكهما في كلمات شائعة.
 */
export function similarity(a: string, b: string): number {
  return 0.55 * wordSimilarity(a, b) + 0.45 * charSimilarity(a, b);
}

export type WordDiff = {
  /** موضع أول كلمة مختلفة (بعد التطبيع)، أو -1 إذا تطابق النصان. */
  index: number;
  /** الكلمة في النص الأول كما وردت أصلاً (بتشكيلها). */
  left: string | null;
  /** الكلمة في النص الثاني كما وردت أصلاً. */
  right: string | null;
};

/** أول فرق كلمي بين نصين — أساس سؤال «الفرق بين آيتين». */
export function firstWordDifference(a: string, b: string): WordDiff {
  const aw = words(a);
  const bw = words(b);
  const an = aw.map((w) => normalizeArabic(w));
  const bn = bw.map((w) => normalizeArabic(w));
  const max = Math.max(an.length, bn.length);
  for (let i = 0; i < max; i += 1) {
    if (an[i] !== bn[i]) {
      return { index: i, left: aw[i] ?? null, right: bw[i] ?? null };
    }
  }
  return { index: -1, left: null, right: null };
}

/** كل مواضع الاختلاف الكلمي (للتصحيح التفصيلي). */
export function wordDifferences(a: string, b: string): number[] {
  const an = normalizedWords(a);
  const bn = normalizedWords(b);
  const out: number[] = [];
  for (let i = 0; i < Math.max(an.length, bn.length); i += 1) {
    if (an[i] !== bn[i]) out.push(i);
  }
  return out;
}
