import { afterEach, describe, expect, it } from "vitest";
import { ayahSpan, formatAyahRange, formatDay, isPastDay, nearestReview } from "./format";
import { setLocale } from "./i18n";

const NOW = new Date(2026, 9, 2, 10, 0); // الجمعة 2 أكتوبر 2026 محلياً

describe("formatAyahRange", () => {
  it("صيغة موحّدة بلا عزل اتجاه (البداية تُعرض يميناً في RTL كما يقرؤها العربي)", () => {
    expect(ayahSpan(1, 11)).toBe("1–11");
    expect(formatAyahRange("الملك", 1, 11)).toBe("سورة الملك · الآيات 1–11");
    expect(formatAyahRange("الملك", 1, 11)).not.toMatch(/[\u2066-\u2069]/);
  });
  it("الآية الواحدة بصيغة المفرد", () => {
    expect(formatAyahRange("البقرة", 255, 255)).toBe("سورة البقرة · الآية 255");
  });
});

describe("formatDay", () => {
  afterEach(() => setLocale("ar"));
  it("اليوم وغداً وأمس نسبياً", () => {
    expect(formatDay("2026-10-02", NOW)).toBe("اليوم");
    expect(formatDay("2026-10-03", NOW)).toMatch(/^غد/);
    expect(formatDay("2026-10-01", NOW)).toBe("أمس");
  });
  it("غير ذلك: يوم وشهر بأرقام لاتينية، والسنة إن اختلفت", () => {
    const s = formatDay("2026-10-09", NOW);
    expect(s).toContain("9");
    expect(s).toContain("أكتوبر");
    expect(s).not.toContain("2026");
    expect(formatDay("2027-01-05", NOW)).toContain("2027");
  });
  it("لا انزياح منطقة زمنية لـ YYYY-MM-DD، والطابع الكامل مقبول", () => {
    expect(formatDay("2026-10-02T23:30:00", NOW)).toBe("اليوم");
  });
  it("القيم الفارغة وغير الصالحة", () => {
    expect(formatDay(null, NOW)).toBe("—");
    expect(formatDay("not-a-date", NOW)).toBe("not-a-date");
  });
});

describe("nearestReview وisPastDay", () => {
  it("أقرب موعد قادم لا أول تاريخ في القائمة", () => {
    expect(nearestReview(["2026-11-20", null, "2026-10-04", "2026-10-02"], NOW)).toBe("2026-10-02");
    expect(nearestReview(["2026-11-20", "2026-10-05"], NOW)).toBe("2026-10-05");
  });
  it("إن فاتت كلها: الأحدث منها (مستحقة)، ولا شيء إن لم توجد", () => {
    expect(nearestReview(["2026-09-01", "2026-09-20"], NOW)).toBe("2026-09-20");
    expect(nearestReview([null, undefined], NOW)).toBeNull();
  });
  it("isPastDay", () => {
    expect(isPastDay("2026-10-01", NOW)).toBe(true);
    expect(isPastDay("2026-10-02", NOW)).toBe(false);
    expect(isPastDay(null, NOW)).toBe(false);
  });
});
