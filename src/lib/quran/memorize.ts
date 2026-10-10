/**
 * وضع الحفظ التدريجي (المرحلة 8.1) — منطق خالص.
 *
 * - مستويات الإخفاء 0..4 تعمل على كلمات النص العثماني كما هو: لا تغيير في أي حرف. كل مقطع يحمل
 *   نصّه الأصلي (`text`)، والواجهة تقرّر إظهاره أو إخفاءه. ضمّ المقاطع يعيد نص الآية حرفياً.
 * - «أول حرف»: أول عنقود كتابي (الحرف مع حركاته) من الكلمة، لا حرف مجرّد.
 * - جدول التكرار: كل آية N مرات، ثم ربطها بالتي قبلها، ثم المقطع كاملاً.
 * - «أتقنتُها» لا تحسب شيئاً هنا: تمرّ بـ apply_review (القاعدة 4).
 */

export const MEMORIZE_LEVELS = [
  { level: 0, label: "النص كاملاً" },
  { level: 1, label: "إخفاء كلمة من كل ثلاث" },
  { level: 2, label: "إخفاء كلمة من كل اثنتين" },
  { level: 3, label: "أول حرف من كل كلمة" },
  { level: 4, label: "إخفاء الآية كلها" },
] as const;

export type MemorizeLevel = 0 | 1 | 2 | 3 | 4;

export type Segment =
  | { kind: "space"; text: string }
  | { kind: "word"; text: string; index: number; hidden: boolean; hint: string };

/** علامات الوقف والرموز القرآنية الصغيرة لا تُعدّ كلمات ولا تُخفى. */
const MARK_ONLY = /^[\u06D6-\u06ED\u0615-\u061A\u06DD\u06DE\u06E9]+$/u;

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? // eslint-disable-next-line no-restricted-syntax -- تقطيع نص المصحف العربي، لا تنسيق أرقام
      new Intl.Segmenter("ar", { granularity: "grapheme" })
    : null;

/** أول عنقود كتابي: الحرف مع ما يتبعه من حركات وعلامات. */
export function firstGrapheme(word: string): string {
  if (!word) return "";
  if (segmenter) {
    for (const s of segmenter.segment(word)) return s.segment;
  }
  const m = word.match(/^.[\u064B-\u065F\u0670\u06D6-\u06ED]*/u);
  return m ? m[0] : word[0];
}

/** هل تُخفى الكلمة رقم i (من الكلمات القابلة للإخفاء) في هذا المستوى؟ */
export function isHidden(level: MemorizeLevel, i: number): boolean {
  switch (level) {
    case 0:
      return false;
    case 1:
      return i % 3 === 2;
    case 2:
      return i % 2 === 1;
    default:
      return true;
  }
}

/** يقسم نص الآية إلى مقاطع مع حالة الإخفاء. `segments.map(s => s.text).join("") === text` دائماً. */
export function maskAyah(text: string, level: MemorizeLevel): Segment[] {
  const parts = text.split(/(\s+)/u).filter((p) => p !== "");
  let i = 0;
  return parts.map((p): Segment => {
    if (/^\s+$/u.test(p)) return { kind: "space", text: p };
    if (MARK_ONLY.test(p)) return { kind: "word", text: p, index: -1, hidden: false, hint: p };
    const index = i++;
    return { kind: "word", text: p, index, hidden: isHidden(level, index), hint: firstGrapheme(p) };
  });
}

/** ما يُعرض للمقطع: النص، أو أول حرف في المستوى 3، أو لا شيء (مكان فارغ بعرض الكلمة). */
export function displayOf(seg: Segment, level: MemorizeLevel, revealed: boolean): string | null {
  if (seg.kind === "space" || !seg.hidden || revealed) return seg.text;
  return level === 3 ? seg.hint : null;
}

export type Step =
  | { kind: "ayah"; from: number; to: number; times: number }
  | { kind: "link"; from: number; to: number; times: number }
  | { kind: "whole"; from: number; to: number; times: number };

/** جدول التكرار: كل آية N مرات، ثم ربطها بالسابقة مرة، ثم المقطع كاملاً مرة. */
export function repetitionPlan(from: number, to: number, times: number): Step[] {
  const n = Math.max(1, Math.min(20, Math.floor(times)));
  if (!(from >= 1) || to < from) return [];
  const steps: Step[] = [];
  for (let a = from; a <= to; a++) {
    steps.push({ kind: "ayah", from: a, to: a, times: n });
    if (a > from) steps.push({ kind: "link", from: a - 1, to: a, times: 1 });
  }
  if (to - from >= 2) steps.push({ kind: "whole", from, to, times: 1 });
  return steps;
}

export function stepLabel(s: Step): string {
  if (s.kind === "ayah") return `الآية ${s.from} × ${s.times}`;
  if (s.kind === "link") return `ربط ${s.from}–${s.to}`;
  return `المقطع ${s.from}–${s.to}`;
}

/** المستوى التالي بعد تسميع صحيح، أو السابق بعد تعثّر. */
export function nextLevel(level: MemorizeLevel, ok: boolean): MemorizeLevel {
  const n = ok ? level + 1 : level - 1;
  return Math.max(0, Math.min(4, n)) as MemorizeLevel;
}
