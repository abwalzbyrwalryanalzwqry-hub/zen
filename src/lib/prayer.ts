import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "adhan";
import { intlLocale } from "@/lib/i18n";

/**
 * مواقيت الصلاة محلياً بلا خادم (adhan-js). الموقع يبقى على الجهاز فقط (localStorage)
 * ومقرَّباً إلى منزلتين عشريتين (نحو كيلومتر)، ولا يُرسَل إلى أي خادم.
 */

export const PRAYER_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type PrayerName = (typeof PRAYER_KEYS)[number];

export const PRAYER_NAMES: Record<PrayerName, string> = {
  fajr: "الفجر",
  dhuhr: "الظهر",
  asr: "العصر",
  maghrib: "المغرب",
  isha: "العشاء",
};

export const METHODS = [
  { key: "UmmAlQura", label: "أم القرى (مكة المكرمة)" },
  { key: "MuslimWorldLeague", label: "رابطة العالم الإسلامي" },
  { key: "Egyptian", label: "الهيئة المصرية العامة للمساحة" },
  { key: "Karachi", label: "جامعة العلوم الإسلامية بكراتشي" },
  { key: "Dubai", label: "دبي" },
  { key: "Kuwait", label: "الكويت" },
  { key: "Qatar", label: "قطر" },
  { key: "Turkey", label: "رئاسة الشؤون الدينية التركية" },
  { key: "Singapore", label: "سنغافورة وماليزيا" },
  { key: "NorthAmerica", label: "أمريكا الشمالية (ISNA)" },
  { key: "MoonsightingCommittee", label: "لجنة رؤية الهلال" },
] as const;
export type MethodKey = (typeof METHODS)[number]["key"];

export const CITIES = [
  { name: "صنعاء", lat: 15.37, lng: 44.19 },
  { name: "عدن", lat: 12.79, lng: 45.03 },
  { name: "تعز", lat: 13.58, lng: 44.02 },
  { name: "الحديدة", lat: 14.8, lng: 42.95 },
  { name: "المكلا", lat: 14.54, lng: 49.12 },
  { name: "مكة المكرمة", lat: 21.42, lng: 39.83 },
  { name: "المدينة المنورة", lat: 24.47, lng: 39.61 },
  { name: "الرياض", lat: 24.71, lng: 46.68 },
  { name: "القاهرة", lat: 30.04, lng: 31.24 },
  { name: "عمّان", lat: 31.95, lng: 35.93 },
  { name: "إسطنبول", lat: 41.01, lng: 28.98 },
  { name: "كوالالمبور", lat: 3.14, lng: 101.69 },
] as const;

export type PrayerSettings = {
  lat: number;
  lng: number;
  place: string;
  method: MethodKey;
  /** المذهب في وقت العصر: الجمهور (ظل المثل) أو الحنفية (ظل المثلين). */
  hanafiAsr: boolean;
};

const KEY = "zen-prayer";

export function roundCoord(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parsePrayerSettings(raw: string | null): PrayerSettings | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PrayerSettings>;
    if (typeof v.lat !== "number" || typeof v.lng !== "number") return null;
    if (Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180) return null;
    const method = METHODS.some((m) => m.key === v.method) ? (v.method as MethodKey) : "UmmAlQura";
    return {
      lat: roundCoord(v.lat),
      lng: roundCoord(v.lng),
      place: typeof v.place === "string" ? v.place.slice(0, 40) : "",
      method,
      hanafiAsr: v.hanafiAsr === true,
    };
  } catch {
    return null;
  }
}

export function loadPrayerSettings(): PrayerSettings | null {
  if (typeof window === "undefined") return null;
  try {
    return parsePrayerSettings(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function savePrayerSettings(s: PrayerSettings | null): void {
  try {
    if (!s) localStorage.removeItem(KEY);
    else
      localStorage.setItem(
        KEY,
        JSON.stringify({ ...s, lat: roundCoord(s.lat), lng: roundCoord(s.lng) }),
      );
    window.dispatchEvent(new Event("zen-prayer"));
  } catch {
    // لا شيء
  }
}

export type DayTimes = Record<PrayerName | "sunrise", Date>;

export function prayerTimes(s: PrayerSettings, date = new Date()): DayTimes {
  const params = CalculationMethod[s.method]();
  params.madhab = s.hanafiAsr ? Madhab.Hanafi : Madhab.Shafi;
  const t = new PrayerTimes(new Coordinates(s.lat, s.lng), date, params);
  return {
    fajr: t.fajr,
    sunrise: t.sunrise,
    dhuhr: t.dhuhr,
    asr: t.asr,
    maghrib: t.maghrib,
    isha: t.isha,
  };
}

/** الصلاة القادمة (ولو فجر الغد بعد العشاء). */
export function nextPrayer(s: PrayerSettings, now = new Date()): { name: PrayerName; at: Date } {
  const today = prayerTimes(s, now);
  for (const k of PRAYER_KEYS) if (today[k] > now) return { name: k, at: today[k] };
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { name: "fajr", at: prayerTimes(s, tomorrow).fajr };
}

/** هل دخل وقت الصلاة اليوم؟ (لمحاسبتي: لا تُسجَّل صلاة لم يدخل وقتها). */
export function prayerStarted(s: PrayerSettings, name: PrayerName, now = new Date()): boolean {
  return prayerTimes(s, now)[name] <= now;
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString(intlLocale(), { hour: "numeric", minute: "2-digit" });
}

/** «بعد ساعة و5 دقائق» / «بعد 12 دقيقة». */
export function formatCountdown(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `بعد ${m} دقيقة`;
  if (m === 0) return h === 1 ? "بعد ساعة" : `بعد ${h} ساعات`;
  return `بعد ${h === 1 ? "ساعة" : `${h} ساعات`} و${m} دقيقة`;
}

/** YYYY-MM-DD بالتوقيت المحلي للجهاز. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
