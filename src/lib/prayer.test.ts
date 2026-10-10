import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  localDay,
  nextPrayer,
  parsePrayerSettings,
  prayerStarted,
  prayerTimes,
  type PrayerSettings,
} from "./prayer";
import { categoryOn, hhmm, pushError, toggleCategory, DEFAULT_PREFS } from "./push";

const sanaa: PrayerSettings = {
  lat: 15.37,
  lng: 44.19,
  place: "صنعاء",
  method: "UmmAlQura",
  hanafiAsr: false,
};
// 2026-10-01 في صنعاء (UTC+3). نقارن بالساعة UTC لتفادي منطقة جهاز الاختبار.
const day = new Date("2026-10-01T09:00:00Z");
const utcHour = (d: Date) => d.getUTCHours() + d.getUTCMinutes() / 60;

describe("prayer", () => {
  it("مواقيت صنعاء معقولة ومرتّبة", () => {
    const t = prayerTimes(sanaa, day);
    // الفجر نحو 4:30 محلياً = 1:30 UTC، والمغرب نحو 5:50 مساءً = 14:50 UTC.
    expect(utcHour(t.fajr)).toBeGreaterThan(1);
    expect(utcHour(t.fajr)).toBeLessThan(2.2);
    expect(utcHour(t.maghrib)).toBeGreaterThan(14.3);
    expect(utcHour(t.maghrib)).toBeLessThan(15.3);
    expect(
      t.fajr < t.sunrise &&
        t.sunrise < t.dhuhr &&
        t.dhuhr < t.asr &&
        t.asr < t.maghrib &&
        t.maghrib < t.isha,
    ).toBe(true);
    // أم القرى: العشاء بعد المغرب بـ90 دقيقة.
    expect(Math.round((t.isha.getTime() - t.maghrib.getTime()) / 60000)).toBe(90);
  });

  it("العصر الحنفي متأخر عن الجمهور", () => {
    expect(prayerTimes({ ...sanaa, hanafiAsr: true }, day).asr > prayerTimes(sanaa, day).asr).toBe(
      true,
    );
  });

  it("الصلاة القادمة، وبعد العشاء فجر الغد", () => {
    const t = prayerTimes(sanaa, day);
    expect(nextPrayer(sanaa, new Date(t.dhuhr.getTime() + 60000)).name).toBe("asr");
    const late = new Date(t.isha.getTime() + 60000);
    const n = nextPrayer(sanaa, late);
    expect(n.name).toBe("fajr");
    expect(n.at > late).toBe(true);
    expect(prayerStarted(sanaa, "asr", new Date(t.asr.getTime() - 60000))).toBe(false);
    expect(prayerStarted(sanaa, "asr", t.asr)).toBe(true);
  });

  it("الإعداد المحفوظ يُتحقَّق منه ويُقرَّب الموقع", () => {
    expect(parsePrayerSettings(null)).toBeNull();
    expect(parsePrayerSettings("{bad")).toBeNull();
    expect(parsePrayerSettings(JSON.stringify({ lat: 99, lng: 0 }))).toBeNull();
    expect(
      parsePrayerSettings(JSON.stringify({ lat: 15.36941, lng: 44.19101, method: "Nope" })),
    ).toEqual({
      lat: 15.37,
      lng: 44.19,
      place: "",
      method: "UmmAlQura",
      hanafiAsr: false,
    });
  });

  it("العدّ التنازلي واليوم المحلي", () => {
    expect(formatCountdown(12 * 60000)).toBe("بعد 12 دقيقة");
    expect(formatCountdown(60 * 60000)).toBe("بعد ساعة");
    expect(formatCountdown(65 * 60000)).toBe("بعد ساعة و5 دقيقة");
    expect(formatCountdown(3 * 3600000)).toBe("بعد 3 ساعات");
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("push prefs", () => {
  it("الفئة مفعّلة ما لم تُطفأ صراحة، والتفعيل يحذف المفتاح", () => {
    expect(categoryOn(DEFAULT_PREFS, "grades")).toBe(true);
    const off = toggleCategory(DEFAULT_PREFS, "grades", false);
    expect(off.categories).toEqual({ grades: false });
    expect(categoryOn(off, "grades")).toBe(false);
    expect(toggleCategory(off, "grades", true).categories).toEqual({});
  });

  it("الوقت والأخطاء", () => {
    expect(hhmm("20:00:00")).toBe("20:00");
    expect(hhmm(null)).toBe("");
    expect(pushError("ERROR: INVALID_TIMEZONE")).toBe("المنطقة الزمنية غير معروفة.");
  });
});
