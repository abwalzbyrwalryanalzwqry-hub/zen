/**
 * مطابقة التلاوة بالنص كلمةً كلمة (المرحلة 8.3).
 *
 * «النموذج يسمع، والمطابقة تحكم»: نموذج التفريغ يعطي نصاً فقط، والحكم على كل كلمة يصدر هنا،
 * على الجهاز، بمحاذاة مسافة التحرير على مستوى الكلمات بعد تطبيع `exam/text.ts`.
 * النص المرجعي المعروض لا يُعدَّل: كل نتيجة تحمل الكلمة الأصلية بتشكيلها وموضعها.
 */
import { editDistance, normalizeArabic } from "@/lib/exam/text";

export type WordStatus = "ok" | "missed" | "wrong" | "pending";

export interface RefWord {
  /** موضع الكلمة في النص المرجعي (بعد إسقاط رموز الوقف). */
  index: number;
  /** الكلمة كما وردت (عثماني). */
  text: string;
  status: WordStatus;
  /** ما سُمع مكانها عند `wrong` أو تقارب الرسم عند `ok`. */
  heard?: string;
}

export interface ExtraWord {
  /** الكلمة المسموعة الزائدة. */
  text: string;
  /** أُدرجت قبل الكلمة المرجعية ذات هذا الموضع (أو بعد الأخيرة = طول المرجع). */
  before: number;
}

export interface Alignment {
  words: RefWord[];
  extra: ExtraWord[];
  /** عدد كلمات المرجع التي بلغها القارئ (موضع التوقف). */
  stop: number;
  counts: { ok: number; missed: number; wrong: number; extra: number };
  /** نسبة الصحيح من الكلمات المبلوغة (0..1). */
  accuracy: number;
}

interface Tok {
  raw: string;
  key: string;
}

function tokens(text: string): Tok[] {
  return text
    .split(/\s+/u)
    .map((raw) => ({ raw, key: normalizeArabic(raw).replace(/\s+/g, "") }))
    .filter((t) => t.key.length > 0);
}

/** تشابه كلمتين مطبَّعتين، مع تسامح في فروق الرسم العثماني والإملائي (الكتب/الكتاب، الصلوه/الصلاه). */
export function wordMatch(a: string, b: string): number {
  if (a === b) return 1;
  const strip = (s: string) => s.replace(/[اوي]/g, "");
  if (strip(a) === strip(b) && strip(a).length >= 2) return 0.9;
  const d = editDistance(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

const NEAR = 0.75;

/**
 * يحاذي ما سُمع بالنص المرجعي.
 * `partial`: تلاوة جارية؛ الكلمات بعد موضع التوقف `pending` لا `missed`.
 */
export function alignRecitation(
  reference: string,
  heard: string,
  opts: { partial?: boolean } = {},
): Alignment {
  const R = tokens(reference);
  const H = tokens(heard);
  const n = R.length;
  const m = H.length;
  const sub = (i: number, j: number) => (wordMatch(R[i].key, H[j].key) >= NEAR ? 0 : 1);

  // D[i][j]: أقل كلفة لمحاذاة أول i من المرجع بأول j مما سُمع.
  const D: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      D[i][j] = Math.min(D[i - 1][j - 1] + sub(i - 1, j - 1), D[i - 1][j] + 1, D[i][j - 1] + 1);

  // نهاية المحاذاة: كل المرجع، أو (في الجاري) أفضل موضع توقف مع تفضيل الأبعد عند التعادل.
  let end = n;
  if (opts.partial) {
    end = 0;
    for (let i = 0; i <= n; i++) if (D[i][m] <= D[end][m]) end = i;
  }

  const words: RefWord[] = R.map((t, index) => ({ index, text: t.raw, status: "pending" }));
  const extra: ExtraWord[] = [];
  let i = end;
  let j = m;
  let stop = 0;
  while (i > 0 || j > 0) {
    // عند التعادل نفضّل «ساقطة» على المطابقة، فتُنسب الكلمة المسموعة إلى أول موضع مطابق
    // (مثلاً «عليهم» الأولى لا الثانية في الفاتحة 7).
    if (
      i > 0 &&
      D[i][j] === D[i - 1][j] + 1 &&
      !(j > 0 && D[i][j] === D[i - 1][j - 1] + sub(i - 1, j - 1) && sub(i - 1, j - 1) === 1)
    ) {
      words[i - 1].status = "missed";
      i--;
    } else if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + sub(i - 1, j - 1)) {
      const ok = sub(i - 1, j - 1) === 0;
      words[i - 1].status = ok ? "ok" : "wrong";
      if (!ok || R[i - 1].key !== H[j - 1].key) words[i - 1].heard = H[j - 1].raw;
      stop = Math.max(stop, i);
      i--;
      j--;
    } else {
      extra.unshift({ text: H[j - 1].raw, before: i });
      j--;
    }
  }
  if (!opts.partial) {
    for (const w of words) if (w.status === "pending") w.status = "missed";
    stop = Math.max(stop, 0);
  } else {
    // الكلمات «الساقطة» بعد آخر كلمة مسموعة هي ما لم يُبلغ بعد.
    for (const w of words) if (w.index >= stop && w.status === "missed") w.status = "pending";
  }

  const c = { ok: 0, missed: 0, wrong: 0, extra: extra.length };
  for (const w of words) if (w.status !== "pending") c[w.status]++;
  const reached = c.ok + c.missed + c.wrong;
  return { words, extra, stop, counts: c, accuracy: reached ? c.ok / reached : 0 };
}
