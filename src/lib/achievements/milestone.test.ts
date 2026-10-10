import { describe, expect, it } from "vitest";
import { milestoneFor, shareableMilestones } from "./milestone";

describe("بطاقات الإنجاز (11.4)", () => {
  it("ختم جزء بالترتيب العربي", () => {
    const m = milestoneFor({ kind: "juz", no: 30 });
    expect(m?.headline).toBe("ختمتُ حفظ الجزء الثلاثون");
    expect(m?.shareText).toContain("من تطبيق زِن");
  });
  it("السلسلة من 30 يوماً فقط", () => {
    expect(milestoneFor({ kind: "streak", no: 7 })).toBeNull();
    expect(milestoneFor({ kind: "streak", no: 30 })?.headline).toBe("30 يوماً متتالية");
  });
  it("لا بطاقة لغير الأجزاء والسلاسل، ولا درجات ولا محاسبة في النص", () => {
    expect(milestoneFor({ kind: "surah", no: 1 })).toBeNull();
    expect(milestoneFor({ kind: "hizb", no: 1 })).toBeNull();
    const all = [milestoneFor({ kind: "juz", no: 1 }), milestoneFor({ kind: "streak", no: 100 })];
    for (const m of all) {
      const text = `${m?.headline} ${m?.sub} ${m?.shareText}`;
      expect(text).not.toMatch(/محاسب|درجة|\/100|%|ترتيب/);
    }
  });
  it("الأحدث أولاً", () => {
    const list = shareableMilestones([
      { kind: "juz", no: 30, label: "", earned_at: "2026-01-01" },
      { kind: "streak", no: 30, label: "", earned_at: "2026-03-01" },
      { kind: "surah", no: 1, label: "", earned_at: "2026-04-01" },
    ]);
    expect(list.map((m) => m.key)).toEqual(["streak-30", "juz-30"]);
  });
});
