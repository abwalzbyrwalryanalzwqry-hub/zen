import { describe, expect, it } from "vitest";
import { guardianMessage, reasonLabel, reviewPlan, type AtRiskStudent } from "./at-risk";

const s = (p: Partial<AtRiskStudent>): AtRiskStudent => ({
  student_id: "s",
  name: "أحمد",
  halaqa_id: "h",
  halaqa_name: "حلقة الفجر",
  reasons: [],
  absences: 0,
  avg_score: null,
  overdue: 0,
  inactive_days: 2,
  has_guardian: true,
  ...p,
});

describe("الإنذار المبكر (9.4)", () => {
  it("نصوص الأسباب", () => {
    expect(reasonLabel("absences", s({ absences: 3 }))).toBe("غاب 3 مرات متتالية");
    expect(reasonLabel("inactive", s({ inactive_days: null }))).toBe("لا نشاط مسجّل بعد");
    expect(reasonLabel("overdue", s({ overdue: 25 }))).toContain("25");
  });
  it("خطة المراجعة بين 3 و10 يومياً", () => {
    expect(reviewPlan(s({ overdue: 0 }))).toBeNull();
    expect(reviewPlan(s({ overdue: 21 }))).toMatchObject({ perDay: 3, days: 7 });
    expect(reviewPlan(s({ overdue: 200 }))).toMatchObject({ perDay: 10, days: 20 });
  });
  it("رسالة وليّ الأمر بلا درجات", () => {
    const m = guardianMessage(
      s({ reasons: ["absences", "low_grade", "overdue"], absences: 4, avg_score: 52, overdue: 30 }),
    );
    expect(m).toContain("أحمد");
    expect(m).toContain("4 مرات");
    expect(m).not.toContain("52");
    expect(m).toContain("مقاطع يومياً");
  });
});
