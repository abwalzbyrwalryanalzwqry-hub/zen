/**
 * تواريخ «محاسبتي»: كل الأيام بالتوقيت المحلي للجهاز بصيغة YYYY-MM-DD،
 * لأن «اليوم» عند الطالب هو يومه هو، لا يوم UTC.
 */

export function isoDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** يحوّل YYYY-MM-DD إلى تاريخ محلي عند الظهيرة (يتجنّب قفزات التوقيت الصيفي). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

/** عدد الأيام من a إلى b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);
}

/** 0 = الأحد … 6 = السبت */
export function weekday(day: string): number {
  return parseDay(day).getDay();
}

/** بداية الأسبوع: السبت، كما في التقويم المعتمد في اليمن والخليج. */
export function weekStart(day: string): string {
  const offset = (weekday(day) + 1) % 7; // السبت ⇒ 0
  return addDays(day, -offset);
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function daysInMonth(day: string): number {
  const d = parseDay(day);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** يعيد قائمة الأيام من from إلى to شاملة. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  const n = daysBetween(from, to);
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

const WEEKDAY_FMT = "ar";

/** «الثلاثاء» */
export function weekdayName(day: string): string {
  try {
    return new Intl.DateTimeFormat(WEEKDAY_FMT, { weekday: "long" }).format(parseDay(day));
  } catch {
    return "";
  }
}

/** «10 ربيع الآخر 1448» — بتقويم أم القرى، وأرقام لاتينية كبقية التطبيق. */
export function hijriDate(day: string): string {
  try {
    const parts = new Intl.DateTimeFormat("ar-u-ca-islamic-umalqura-nu-latn", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).formatToParts(parseDay(day));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const text = `${get("day")} ${get("month")} ${get("year")}`.trim();
    return text.replace(/\s+/g, " ");
  } catch {
    return "";
  }
}

/** «22 سبتمبر 2026» */
export function gregorianDate(day: string): string {
  try {
    return new Intl.DateTimeFormat("ar-u-nu-latn", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(parseDay(day));
  } catch {
    return day;
  }
}

/** «22 سبتمبر» */
export function shortDate(day: string): string {
  try {
    return new Intl.DateTimeFormat("ar-u-nu-latn", { day: "numeric", month: "long" }).format(
      parseDay(day),
    );
  } catch {
    return day;
  }
}

export function monthName(day: string): string {
  try {
    return new Intl.DateTimeFormat("ar-u-nu-latn", { month: "long", year: "numeric" }).format(
      parseDay(day),
    );
  } catch {
    return day.slice(0, 7);
  }
}

/** «يوم واحد» · «يومان» · «3 أيام» · «11 يوماً» */
export function daysLabel(n: number): string {
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}
