import { afterEach, describe, expect, it, vi } from "vitest";
import { addLocalDays, localDayKey, localDayOf } from "./local-day";

/**
 * الاختبارات تُشغَّل تحت مناطق زمنية مختلفة بـ `TZ` (انظر `test:tz` في package.json). هنا نتحقق من
 * الثوابت التي لا تتغيّر مع المنطقة، ومن حالة «الفجر في جاكرتا» بمحاكاة إزاحة المنطقة.
 */
describe("local-day (تدقيق 1.1)", () => {
  afterEach(() => vi.useRealTimers());

  it("localDayKey يطابق مكوّنات التاريخ المحلي لا UTC", () => {
    const d = new Date(2026, 9, 2, 1, 30); // 01:30 محلياً
    expect(localDayKey(d)).toBe("2026-10-02");
  });

  it("localDayOf يحوّل طابع UTC إلى اليوم المحلي", () => {
    const local = new Date(2026, 9, 2, 5, 0); // الفجر محلياً
    const iso = local.toISOString(); // قد يكون بتاريخ الأمس في UTC شرق غرينتش
    expect(localDayOf(iso)).toBe("2026-10-02");
    expect(localDayOf(iso.replace("Z", "+00:00"))).toBe("2026-10-02");
  });

  it("localDayOf يُبقي التاريخ المجرّد كما هو ويتسامح مع الفارغ", () => {
    expect(localDayOf("2026-10-02")).toBe("2026-10-02");
    expect(localDayOf(null)).toBe("");
    expect(localDayOf("")).toBe("");
  });

  it("addLocalDays يعبر الأشهر والسنوات", () => {
    expect(addLocalDays(1, new Date(2026, 11, 31, 23, 59))).toBe("2027-01-01");
    expect(addLocalDays(-1, new Date(2026, 2, 1, 0, 5))).toBe("2026-02-28");
    expect(addLocalDays(7, new Date(2026, 9, 2, 0, 1))).toBe("2026-10-09");
  });

  it("اليوم الافتراضي هو اليوم المحلي للساعة الحالية", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 0, 15));
    expect(localDayKey()).toBe("2026-10-02");
    expect(addLocalDays(0)).toBe("2026-10-02");
  });
});
