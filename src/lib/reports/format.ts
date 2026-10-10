/**
 * طبقة العرض للأرقام والتواريخ في التقارير. القيم الداخلية تبقى أرقاماً وتواريخ ISO (YYYY-MM-DD)؛ التحويل
 * إلى الأرقام العربية (٠١٢٣) أو اللاتينية والتقويم الهجري يحدث هنا فقط عند العرض والتصدير.
 */
import { parseDay } from "@/lib/muhasaba/dates";

export type Digits = "arab" | "latn";
export type CalendarMode = "gregorian" | "hijri" | "both";

export interface NumberStyle {
  digits: Digits;
  calendar: CalendarMode;
}

/** تقريب آمن من أخطاء الفاصلة العائمة (96.899999 ⇒ 96.9). */
export function roundTo(n: number, decimals = 1): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

const numCache = new Map<string, Intl.NumberFormat>();
function nf(digits: Digits, decimals: number): Intl.NumberFormat {
  const key = `${digits}:${decimals}`;
  let f = numCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(`ar-u-nu-${digits}`, {
      maximumFractionDigits: decimals,
      useGrouping: false,
    });
    numCache.set(key, f);
  }
  return f;
}

/** رقم للعرض بالأرقام المختارة، بلا كسور زائفة. null ⇒ «—». */
export function fmtNum(n: number | null | undefined, digits: Digits, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return nf(digits, decimals).format(roundTo(n, decimals));
}

/** نسبة مئوية «٨٥٪». */
export function fmtPct(n: number | null | undefined, digits: Digits): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${fmtNum(Math.round(n), digits, 0)}٪`;
}

const dateCache = new Map<string, Intl.DateTimeFormat>();
function df(key: string, locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = dateCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    dateCache.set(key, f);
  }
  return f;
}

const LONG: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };

/** «٢٤ سبتمبر ٢٠٢٦». */
export function fmtGregorian(day: string, digits: Digits): string {
  try {
    return df(`g:${digits}`, `ar-u-nu-${digits}`, LONG).format(parseDay(day));
  } catch {
    return day;
  }
}

/** «٢ ربيع الآخر ١٤٤٨هـ» بتقويم أم القرى. فارغ إن لم يدعمه المحرّك. */
export function fmtHijri(day: string, digits: Digits): string {
  try {
    const parts = df(`h:${digits}`, `ar-u-ca-islamic-umalqura-nu-${digits}`, LONG).formatToParts(
      parseDay(day),
    );
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const text = `${get("day")} ${get("month")} ${get("year")}`.replace(/\s+/g, " ").trim();
    return text ? `${text}هـ` : "";
  } catch {
    return "";
  }
}

/** التاريخ بالتقويم المختار؛ «كلاهما» ميلادي ثم الهجري بين قوسين. */
export function fmtDate(day: string, style: NumberStyle): string {
  if (style.calendar === "hijri")
    return fmtHijri(day, style.digits) || fmtGregorian(day, style.digits);
  if (style.calendar === "both") {
    const h = fmtHijri(day, style.digits);
    return h ? `${fmtGregorian(day, style.digits)} (${h})` : fmtGregorian(day, style.digits);
  }
  return fmtGregorian(day, style.digits);
}

/** تاريخ قصير للجداول «٢٤/٩/٢٠٢٦» (أو الهجري المختصر). */
export function fmtShortDate(day: string, style: NumberStyle): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "numeric", year: "numeric" };
  try {
    const cal = style.calendar === "hijri" ? "-ca-islamic-umalqura" : "";
    const f = df(`s:${style.digits}:${cal}`, `ar-u${cal}-nu-${style.digits}`, opts);
    return f.format(parseDay(day)).replace(/\s*هـ$/, "");
  } catch {
    return day;
  }
}

/** أرقام لاتينية في نص (للفرز وأسماء الملفات). */
export function toLatinDigits(s: string): string {
  return s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}
