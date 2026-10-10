import { describe, expect, it } from "vitest";
import { goalErrorMessage, goalPercent, goalTitle } from "./family-goals";

describe("الأهداف العائلية (11.3)", () => {
  it("العنوان الافتراضي من النوع والعدد", () => {
    expect(goalTitle({ kind: "pages", target: 10, title: null })).toBe("حفظ صفحات: 10 صفحة");
    expect(goalTitle({ kind: "streak", target: 7, title: "  " })).toBe(
      "سلسلة أيام متتالية: 7 يوماً",
    );
    expect(goalTitle({ kind: "juz", target: 1, title: "جزء عمّ" })).toBe("جزء عمّ");
  });
  it("النسبة بين 0 و100", () => {
    expect(goalPercent({ progress: 3, target: 10 })).toBe(30);
    expect(goalPercent({ progress: 12, target: 10 })).toBe(100);
    expect(goalPercent({ progress: 0, target: 0 })).toBe(0);
  });
  it("رسائل الأخطاء بالعربية", () => {
    expect(goalErrorMessage(new Error("TOO_MANY_GOALS"))).toContain("ثلاثة أهداف");
    expect(goalErrorMessage(new Error("x"))).toContain("تعذّرت");
  });
});
