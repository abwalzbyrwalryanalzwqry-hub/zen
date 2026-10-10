/**
 * تنسيق موحّد للنطاقات والتواريخ (فحص الأقسام، المرحلة P0).
 *
 * النطاق «1–11» يُترك دون عزل اتجاه عمداً: في فقرة RTL تُعرض البداية على اليمين فيقرؤها القارئ العربي أولاً
 * (من 1 إلى 11)، وهو العرف العربي. عزله بـ LRI…PDI يقلب ذلك (تحقّقنا بقياس مواضع الأرقام في Chromium)،
 * فلا يُعزل. والتاريخ الخام «2026-10-02» صعب القراءة، فيُعرض «اليوم» أو «الجمعة 2 أكتوبر».
 */
import { getLocale, t } from "@/lib/i18n";

/** «1–11»، أو «7» إن كان النطاق آية واحدة. */
export function ayahSpan(from: number, to: number): string {
  return from === to ? String(from) : `${from}–${to}`;
}

/** «سورة الملك · الآيات 1–11» (أو «الآية 7»). */
export function formatAyahRange(surah: string, from: number, to: number): string {
  return t(from === to ? "format.ayahOne" : "format.ayahRange", {
    surah,
    range: ayahSpan(from, to),
  });
}

/** يوم محلي من «YYYY-MM-DD» دون انزياح المنطقة الزمنية (new Date("2026-10-02") منتصف ليل UTC). */
function parseDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const DAY_MS = 86_400_000;

/**
 * «اليوم» / «غدًا» / «أمس» لليوم ±1، وإلا «الجمعة 2 أكتوبر» (والسنة إن اختلفت). بأرقام لاتينية كبقية التطبيق.
 * يقبل «YYYY-MM-DD» أو طابعاً زمنياً كاملاً؛ القيمة غير الصالحة تُعاد كما هي بدل «Invalid Date».
 */
export function formatDay(value: string | null | undefined, now = new Date()): string {
  if (!value) return "—";
  const d = parseDay(value) ?? new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const locale = getLocale();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((day.getTime() - today.getTime()) / DAY_MS);
  if (Math.abs(diff) <= 1) {
    const s = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(diff, "day");
    return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
  }
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: day.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(day);
}

/** هل «YYYY-MM-DD» قبل اليوم المحلي؟ (واجب متأخر). */
export function isPastDay(value: string | null | undefined, now = new Date()): boolean {
  const d = value ? parseDay(value) : null;
  if (!d) return false;
  return d.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * أقرب موعد مراجعة قادم (اليوم أو بعده)، وإلا أقرب موعد فات. كانت الواجهة تأخذ أول تقييم فيه تاريخ
 * (الأحدث إنشاءً) فقد تعرض موعداً بعيداً وتُخفي مراجعة مستحقة اليوم.
 */
export function nearestReview(
  dates: (string | null | undefined)[],
  now = new Date(),
): string | null {
  const valid = dates.filter((d): d is string => !!d && !!parseDay(d)).sort();
  if (valid.length === 0) return null;
  return valid.find((d) => !isPastDay(d, now)) ?? valid[valid.length - 1];
}

/** سقف موحَّد للشارات: ما فوق 9 يُعرض «9+» (فحص الأقسام H3). */
export function capCount(n: number): string {
  return n > 9 ? "9+" : String(Math.max(0, Math.trunc(n)));
}
