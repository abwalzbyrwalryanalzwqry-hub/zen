/**
 * مراجع الآيات في ردود المساعد: أسماء السور وأعداد آياتها، وتحقّق المرجع [[السورة:الآية]]، وحذف
 * ﴿…﴾ الذي يكتبه النموذج (كاملاً أو متدفقاً). بلا أي استيراد؛ نسختها في `supabase/functions/_shared/`
 * مطابقة حرفياً (`scripts/check-shared-mirror.mjs`).
 */

// ─── الآيات ───
export const SURAH_NAMES: readonly string[] = [
  "الفاتحة",
  "البقرة",
  "آل عمران",
  "النساء",
  "المائدة",
  "الأنعام",
  "الأعراف",
  "الأنفال",
  "التوبة",
  "يونس",
  "هود",
  "يوسف",
  "الرعد",
  "إبراهيم",
  "الحجر",
  "النحل",
  "الإسراء",
  "الكهف",
  "مريم",
  "طه",
  "الأنبياء",
  "الحج",
  "المؤمنون",
  "النور",
  "الفرقان",
  "الشعراء",
  "النمل",
  "القصص",
  "العنكبوت",
  "الروم",
  "لقمان",
  "السجدة",
  "الأحزاب",
  "سبإ",
  "فاطر",
  "يس",
  "الصافات",
  "ص",
  "الزمر",
  "غافر",
  "فصلت",
  "الشورى",
  "الزخرف",
  "الدخان",
  "الجاثية",
  "الأحقاف",
  "محمد",
  "الفتح",
  "الحجرات",
  "ق",
  "الذاريات",
  "الطور",
  "النجم",
  "القمر",
  "الرحمن",
  "الواقعة",
  "الحديد",
  "المجادلة",
  "الحشر",
  "الممتحنة",
  "الصف",
  "الجمعة",
  "المنافقون",
  "التغابن",
  "الطلاق",
  "التحريم",
  "الملك",
  "القلم",
  "الحاقة",
  "المعارج",
  "نوح",
  "الجن",
  "المزمل",
  "المدثر",
  "القيامة",
  "الإنسان",
  "المرسلات",
  "النبإ",
  "النازعات",
  "عبس",
  "التكوير",
  "الانفطار",
  "المطففين",
  "الانشقاق",
  "البروج",
  "الطارق",
  "الأعلى",
  "الغاشية",
  "الفجر",
  "البلد",
  "الشمس",
  "الليل",
  "الضحى",
  "الشرح",
  "التين",
  "العلق",
  "القدر",
  "البينة",
  "الزلزلة",
  "العاديات",
  "القارعة",
  "التكاثر",
  "العصر",
  "الهمزة",
  "الفيل",
  "قريش",
  "الماعون",
  "الكوثر",
  "الكافرون",
  "النصر",
  "المسد",
  "الإخلاص",
  "الفلق",
  "الناس",
];
export const SURAH_AYAHS: readonly number[] = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112,
  78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37,
  35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
  44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8,
  8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

export type AyahToken = { surah: number; name: string; from: number; to: number };
export type AnswerPart = { kind: "text"; text: string } | { kind: "ayah"; ref: AyahToken };

const TOKEN_RE = /\[\[\s*([^\]:]+?)\s*:\s*([0-9٠-٩]{1,3})(?:\s*[-–]\s*([0-9٠-٩]{1,3}))?\s*\]\]/g;
const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

export function resolveAyahToken(name: string, a: string, b?: string): AyahToken | null {
  const clean = name.replace(/^سورة\s+/, "").trim();
  const idx = SURAH_NAMES.indexOf(clean);
  if (idx < 0) return null;
  const from = Number(toLatin(a));
  const to = b ? Number(toLatin(b)) : from;
  if (from < 1 || to < from || to > SURAH_AYAHS[idx] || to - from > 9) return null;
  return { surah: idx + 1, name: clean, from, to };
}

/**
 * ينظّف ردّ النموذج: أي نص بين ﴿ ﴾ كتبه النموذج يُحذف (قد يكون محرّفاً)، والمراجع غير الصحيحة
 * تتحوّل إلى نص عادي. تبقى المراجع الصحيحة ليعرضها التطبيق من المصحف.
 */
export function groundAnswer(text: string): { text: string; removedQuotes: number; refs: number } {
  let removedQuotes = 0;
  let refs = 0;
  let out = text.replace(/﴿[^﴾]{2,}﴾/g, () => {
    removedQuotes++;
    return "﴿…﴾";
  });
  out = out.replace(TOKEN_RE, (all, n: string, a: string, b?: string) => {
    const r = resolveAyahToken(n, a, b);
    if (!r) return `(${n.trim()} ${a}${b ? "-" + b : ""})`;
    refs++;
    return all;
  });
  return { text: out, removedQuotes, refs };
}

/** يقسم الرد إلى نص ومراجع آيات لعرضها. */
export function splitAnswer(text: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const r = resolveAyahToken(m[1], m[2], m[3]);
    if (!r) continue;
    if (m.index! > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    parts.push({ kind: "ayah", ref: r });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

/**
 * حذف ﴿…﴾ وتصحيح المراجع على كل مقطع متدفق: يُمسك النص من أول «﴿» أو «[[» لم يُغلق بعد حتى
 * يكتمل، فيطابق مجموع المقاطع `groundAnswer` على الرد كاملاً، ولا يظهر نص قرآني كتبه النموذج ولو
 * لحظة.
 */
export class StreamGrounder {
  private buf = "";
  private out = "";

  push(chunk: string): string {
    this.buf += chunk;
    let cut = this.buf.length;
    const q = this.buf.lastIndexOf("﴿");
    if (q >= 0 && this.buf.indexOf("﴾", q) < 0) cut = Math.min(cut, q);
    const t = this.buf.lastIndexOf("[[");
    if (t >= 0 && this.buf.indexOf("]]", t) < 0) cut = Math.min(cut, t);
    if (this.buf.endsWith("[")) cut = Math.min(cut, this.buf.length - 1);
    if (cut <= 0) return "";
    const piece = groundAnswer(this.buf.slice(0, cut)).text;
    this.buf = this.buf.slice(cut);
    this.out += piece;
    return piece;
  }

  end(): string {
    const piece = this.buf ? groundAnswer(this.buf).text : "";
    this.buf = "";
    this.out += piece;
    return piece;
  }

  get text(): string {
    return this.out;
  }
}
