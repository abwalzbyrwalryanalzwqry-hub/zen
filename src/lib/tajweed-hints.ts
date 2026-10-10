import { normalizeArabic } from "./tajweed-diff";

/**
 * ملاحظات تجويد إرشادية مبنية على قواعد ثابتة تُطبَّق على النص العثماني المرجعي نفسه
 * (لا على صوت الطالب): مواضع الغنّة والمدود وأحكام النون الساكنة والتنوين والميم الساكنة.
 *
 * ليست حكماً على التلاوة ولا بديلاً عن المعلّم؛ الغاية تنبيه القارئ إلى مواضع الأحكام
 * في المقطع الذي قرأه. لا يُولَّد أي نص قرآني: الكلمات تُنقل من المرجع كما هي.
 */

export const TAJWEED_HINTS_DISCLAIMER =
  "ملاحظات إرشادية آلية على مواضع الأحكام في النص، وليست تقييماً لتلاوتك. المرجع معلّمك.";

export type TajweedRule =
  | "ghunna"
  | "madd_muttasil"
  | "madd_munfasil"
  | "madd_lazim"
  | "izhar"
  | "idgham"
  | "iqlab"
  | "ikhfa"
  | "ikhfa_shafawi"
  | "idgham_shafawi";

export type TajweedHint = {
  /** رقم الكلمة في المرجع (يطابق فهرس diffWords). */
  index: number;
  word: string;
  rule: TajweedRule;
  label: string;
  detail: string;
};

export const RULE_LABEL: Record<TajweedRule, string> = {
  ghunna: "غنّة",
  madd_muttasil: "مدّ متّصل",
  madd_munfasil: "مدّ منفصل",
  madd_lazim: "مدّ لازم",
  izhar: "إظهار",
  idgham: "إدغام",
  iqlab: "إقلاب",
  ikhfa: "إخفاء",
  ikhfa_shafawi: "إخفاء شفوي",
  idgham_shafawi: "إدغام شفوي",
};

const RULE_DETAIL: Record<TajweedRule, string> = {
  ghunna: "نون أو ميم مشدّدة: غنّة بمقدار حركتين.",
  madd_muttasil: "حرف مدّ بعده همز في الكلمة نفسها: يُمدّ ٤ أو ٥ حركات.",
  madd_munfasil:
    "حرف مدّ آخر الكلمة وأول التالية همز: يُمدّ ٤ أو ٥ حركات (ويجوز القصر لحفص من طريق الطيبة).",
  madd_lazim: "حرف مدّ بعده سكون أو شدّة لازمة: يُمدّ ٦ حركات.",
  izhar: "نون ساكنة أو تنوين قبل حرف حلقي: تُظهر النون بلا غنّة زائدة.",
  idgham: "نون ساكنة أو تنوين قبل أحد حروف «يرملون»: تُدغم (بغنّة في ينمو).",
  iqlab: "نون ساكنة أو تنوين قبل الباء: تُقلب ميماً مخفاة مع غنّة.",
  ikhfa: "نون ساكنة أو تنوين قبل حروف الإخفاء: تُخفى مع غنّة بمقدار حركتين.",
  ikhfa_shafawi: "ميم ساكنة قبل الباء: تُخفى مع غنّة.",
  idgham_shafawi: "ميم ساكنة قبل ميم: تُدغم مع غنّة.",
};

const SHADDA = "\u0651";
const SUKUN = "\u0652";
const MADDA = "\u0653";
const HAMZA_ABOVE = "\u0654";
const DAGGER_ALEF = "\u0670";
const SILENT = "\u06DF"; // صفر مستدير: حرف لا يُنطق
const VOWELS = /[\u064E-\u0650]/;
const TANWEEN = /[\u064B-\u064D]/;

const BASE = /[\u0621-\u063A\u0640-\u064A\u0671]/;
const HAMZAS = new Set(["ء", "أ", "إ", "ؤ", "ئ"]);
const MADD_LETTERS = new Set(["ا", "و", "ي", "ى"]);
const IZHAR = new Set(["ء", "أ", "إ", "ؤ", "ئ", "ه", "ع", "ح", "غ", "خ"]);
const IDGHAM = new Set(["ي", "ر", "م", "ل", "و", "ن"]);
const IKHFA = new Set([..."تثجدذزسشصضطظفقك"]);

type Letter = { ch: string; marks: string };

function letters(token: string): Letter[] {
  const out: Letter[] = [];
  for (const c of token) {
    // «آ» المركّبة (خارج المصحف العثماني المرفق) = ألف + علامة مدّ
    if (c === "\u0622") out.push({ ch: "ا", marks: MADDA });
    else if (BASE.test(c)) out.push({ ch: c, marks: "" });
    else if (out.length) out[out.length - 1].marks += c;
  }
  return out;
}

const isHamza = (l: Letter | undefined) =>
  !!l && (HAMZAS.has(l.ch) || l.marks.includes(HAMZA_ABOVE));
const isSilent = (l: Letter) => l.marks.includes(SILENT);
/** ألف أو ياء بلا حركة بعد تنوين الفتح (هُدًى، عَلِيمًا) لا تُنطق وصلاً. */
const isCarrier = (l: Letter) =>
  (l.ch === "ا" || l.ch === "ى") && !/[\u064B-\u0652\u0653]/.test(l.marks);

/** يقسّم المرجع إلى كلمات بنفس فهرسة diffWords (تُسقط علامات الوقف المنفردة). */
export function referenceTokens(reference: string): string[] {
  return reference
    .replace(/[^\u0600-\u06FF\s]/g, " ")
    .split(/\s+/)
    .filter((t) => normalizeArabic(t).length > 0);
}

export function tajweedHints(reference: string): TajweedHint[] {
  const toks = referenceTokens(reference);
  const parsed = toks.map(letters);
  const hints: TajweedHint[] = [];
  const seen = new Set<string>();
  const add = (index: number, rule: TajweedRule) => {
    const key = `${index}:${rule}`;
    if (seen.has(key)) return;
    seen.add(key);
    hints.push({
      index,
      word: toks[index],
      rule,
      label: RULE_LABEL[rule],
      detail: RULE_DETAIL[rule],
    });
  };

  /** أول حرف منطوق بعد الموضع (قد يكون في الكلمة التالية). */
  const nextSpoken = (w: number, i: number): { l: Letter; sameWord: boolean } | null => {
    const word = parsed[w];
    for (let j = i + 1; j < word.length; j++) {
      if (!isSilent(word[j]) && !isCarrier(word[j])) return { l: word[j], sameWord: true };
    }
    const nw = parsed[w + 1];
    if (!nw) return null;
    const first = nw.find((l) => !isSilent(l));
    return first ? { l: first, sameWord: false } : null;
  };

  parsed.forEach((word, w) => {
    word.forEach((l, i) => {
      if (isSilent(l)) return;

      // الغنّة: نون أو ميم مشدّدة
      if ((l.ch === "ن" || l.ch === "م") && l.marks.includes(SHADDA)) add(w, "ghunna");

      // المدود: علامة المدّ فوق حرف مدّ (أو ألف خنجرية) أو فوق حرف من فواتح السور
      if (l.marks.includes(MADDA)) {
        const maddLetter = MADD_LETTERS.has(l.ch) || l.marks.includes(DAGGER_ALEF);
        if (!maddLetter) {
          add(w, "madd_lazim"); // فواتح السور: الٓمٓ، حمٓ …
        } else {
          const after = word.slice(i + 1).find((x) => !isSilent(x));
          if (after && isHamza(after)) add(w, "madd_muttasil");
          else if (after && (after.marks.includes(SHADDA) || after.marks.includes(SUKUN)))
            add(w, "madd_lazim");
          else if (!after && isHamza(parsed[w + 1]?.[0])) add(w, "madd_munfasil");
        }
      }

      // النون الساكنة والتنوين
      const hasVowel = VOWELS.test(l.marks) || l.marks.includes(SHADDA);
      const noonSakin =
        l.ch === "ن" && (l.marks.includes(SUKUN) || !hasVowel) && !TANWEEN.test(l.marks);
      if (noonSakin || TANWEEN.test(l.marks)) {
        const nx = nextSpoken(w, i);
        if (nx && nx.l.ch !== "ٱ") {
          const c = nx.l.ch;
          if (IZHAR.has(c) || isHamza(nx.l)) add(w, "izhar");
          else if (IDGHAM.has(c) && !nx.sameWord) add(w, "idgham");
          else if (c === "ب") add(w, "iqlab");
          else if (IKHFA.has(c)) add(w, "ikhfa");
        }
      }

      // الميم الساكنة قبل الباء أو الميم
      const meemSakin =
        l.ch === "م" && (l.marks.includes(SUKUN) || (!hasVowel && !TANWEEN.test(l.marks)));
      if (meemSakin) {
        const nx = nextSpoken(w, i);
        if (nx?.l.ch === "ب") add(w, "ikhfa_shafawi");
        else if (nx?.l.ch === "م" && !nx.sameWord) add(w, "idgham_shafawi");
      }
    });
  });
  return hints;
}

/** ملخّص عددي للأحكام في المقطع. */
export function countHints(
  hints: TajweedHint[],
): { rule: TajweedRule; label: string; count: number }[] {
  const m = new Map<TajweedRule, number>();
  for (const h of hints) m.set(h.rule, (m.get(h.rule) ?? 0) + 1);
  return [...m.entries()].map(([rule, count]) => ({ rule, label: RULE_LABEL[rule], count }));
}
