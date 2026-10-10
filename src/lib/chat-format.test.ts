import { describe, expect, it } from "vitest";
import { dayLabel, parseAyahRef, startsNewDay } from "./chat-format";

describe("فواصل الأيام", () => {
  const now = new Date("2026-09-28T12:00:00");
  it("اليوم وأمس", () => {
    expect(dayLabel("2026-09-28T08:00:00", now)).toBe("اليوم");
    expect(dayLabel("2026-09-27T23:00:00", now)).toBe("أمس");
  });
  it("يوم جديد", () => {
    expect(startsNewDay(undefined, "2026-09-28T08:00:00")).toBe(true);
    expect(startsNewDay("2026-09-28T08:00:00", "2026-09-28T09:00:00")).toBe(false);
    expect(startsNewDay("2026-09-27T08:00:00", "2026-09-28T09:00:00")).toBe(true);
  });
});

describe("مرجع الآية", () => {
  it("يفهم الصيغ الشائعة والأرقام العربية", () => {
    expect(parseAyahRef("البقرة 255")).toEqual({ surah: 2, name: "البقرة", from: 255, to: 255 });
    expect(parseAyahRef("سورة البقرة: 255-257")).toEqual({
      surah: 2,
      name: "البقرة",
      from: 255,
      to: 257,
    });
    expect(parseAyahRef("آل عمران ٨")).toEqual({ surah: 3, name: "آل عمران", from: 8, to: 8 });
  });
  it("يرفض غير المرجع والنطاق الخاطئ", () => {
    expect(parseAyahRef("حفظت البقرة 255 اليوم")).toBeNull();
    expect(parseAyahRef("الفاتحة 8")).toBeNull();
    expect(parseAyahRef("البقرة 1-50")).toBeNull();
    expect(parseAyahRef("مرحبا 5")).toBeNull();
  });
});
