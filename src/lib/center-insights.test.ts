import { describe, expect, it } from "vitest";
import {
  delta,
  drillRows,
  drillValue,
  needsAttention,
  type DrillStudent,
  type TeacherQuality,
} from "./center-insights";

const s = (name: string, o: Partial<DrillStudent> = {}): DrillStudent => ({
  student_id: name,
  name,
  halaqat: null,
  halaqa_id: null,
  attendance_total: 4,
  absent: 0,
  attendance_rate: 100,
  pages: 0,
  assessments: 0,
  avg_score: null,
  avg_exam: null,
  last_activity: null,
  ...o,
});

describe("التغيّر بين الفترتين", () => {
  it("الأعداد بنسبة تغيّر، والنِّسب بالنقاط", () => {
    expect(delta(120, 100)).toEqual({ trend: "up", diff: 20, pct: 20, good: true });
    expect(delta(70, 80, "rate")).toEqual({ trend: "down", diff: -10, pct: null, good: false });
    expect(delta(5, 0)?.pct).toBeNull();
    expect(delta(3, 3)?.trend).toBe("flat");
    expect(delta(3, 3)?.good).toBeNull();
  });
  it("الارتفاع سيّئ حين يكون المؤشر سلبياً", () => {
    expect(delta(6, 2, "count", false)?.good).toBe(false);
  });
  it("لا تغيّر حين تنقص إحدى الفترتين", () => {
    expect(delta(null, 3)).toBeNull();
    expect(delta(3, undefined)).toBeNull();
  });
});

describe("التعمّق في المؤشر", () => {
  const rows = [
    s("ب", { attendance_rate: 50, pages: 3, avg_score: 90 }),
    s("أ", { attendance_rate: 90, pages: 9, avg_score: 60 }),
    s("ج", { attendance_total: 0, attendance_rate: null, pages: 3 }),
  ];
  it("الحضور: الأقل أولاً، ومن لا حضور له خارج القائمة", () => {
    expect(drillRows(rows, "attendance").map((r) => r.name)).toEqual(["ب", "أ"]);
  });
  it("الصفحات: الأكثر أولاً، والتعادل بالاسم", () => {
    expect(drillRows(rows, "pages").map((r) => r.name)).toEqual(["أ", "ب", "ج"]);
  });
  it("التسميع: الأضعف أولاً، وبلا تسميع خارجها", () => {
    expect(drillRows(rows, "score").map((r) => r.name)).toEqual(["أ", "ب"]);
  });
  it("الطلاب بالاسم، والقيمة المعروضة بحسب المؤشر", () => {
    expect(drillRows(rows, "students").map((r) => r.name)).toEqual(["أ", "ب", "ج"]);
    expect(drillValue(rows[0], "attendance")).toBe("50%");
    expect(drillValue(rows[2], "score")).toBe("—");
    expect(drillValue(rows[1], "pages")).toBe("9");
  });
});

describe("جودة الإدخال لكل معلّم", () => {
  const q = (o: Partial<TeacherQuality>): TeacherQuality => ({
    teacher_id: "t",
    name: "م",
    halaqat: 1,
    records: 10,
    closed: 10,
    same_day: 10,
    same_day_rate: 100,
    late_closes: 0,
    edits_after_close: 0,
    warnings: 0,
    reviewed: 0,
    flagged: 0,
    ...o,
  });
  it("تنبيه للمتابعة عند الإغلاق المتأخر أو كثرة التعديلات أو ملاحظة المشرف", () => {
    expect(needsAttention(q({}))).toBe(false);
    expect(needsAttention(q({ same_day_rate: 60 }))).toBe(true);
    expect(needsAttention(q({ edits_after_close: 5 }))).toBe(true);
    expect(needsAttention(q({ flagged: 1 }))).toBe(true);
    expect(needsAttention(q({ records: 0, same_day_rate: null, flagged: 1 }))).toBe(false);
  });
});
