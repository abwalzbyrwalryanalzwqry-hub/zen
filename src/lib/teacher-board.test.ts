import { describe, expect, it } from "vitest";
import {
  attendanceRatio,
  defaultTeacherTab,
  filterStudents,
  normalizeArabic,
  parseTeacherTab,
} from "./teacher-board";
import { capCount } from "./format";

describe("تبويبات «طلابي» في الرابط", () => {
  it("يقبل المعروف فقط", () => {
    expect(parseTeacherTab("review")).toBe("review");
    expect(parseTeacherTab("attendance")).toBeUndefined();
    expect(parseTeacherTab(undefined)).toBeUndefined();
  });
  it("الافتراضي: التسميعات إن كان فيها ما ينتظر", () => {
    expect(defaultTeacherTab(3)).toBe("review");
    expect(defaultTeacherTab(0)).toBe("students");
  });
});

describe("فلترة الطلاب", () => {
  const s = [
    { id: "1", name: "أحمد علي" },
    { id: "2", name: "فاطمة" },
    { id: "3", name: "مُصطفى" },
  ];
  const membership = { "1": ["h1"], "2": ["h2"], "3": ["h1", "h2"] };
  it("البحث يتجاهل الهمزات والتشكيل والتاء المربوطة", () => {
    expect(normalizeArabic("فاطمة")).toBe(normalizeArabic("فاطمه"));
    expect(filterStudents(s, { q: "احمد" }).map((x) => x.id)).toEqual(["1"]);
    expect(filterStudents(s, { q: "مصطفى" }).map((x) => x.id)).toEqual(["3"]);
  });
  it("فلتر الحلقة مع البحث", () => {
    expect(filterStudents(s, { halaqa: "h1", membership }).map((x) => x.id)).toEqual(["1", "3"]);
    expect(filterStudents(s, { halaqa: "h2", q: "فاطم", membership }).map((x) => x.id)).toEqual([
      "2",
    ]);
    expect(filterStudents(s, { halaqa: null })).toHaveLength(3);
  });
});

describe("مؤشرات الرئيسية", () => {
  it("الحضور «—» قبل أي تسجيل", () => {
    expect(attendanceRatio({ attendance_marked: 0, attendance_present: 0 })).toBe("—");
    expect(attendanceRatio({ attendance_marked: 12, attendance_present: 10 })).toBe("10/12");
  });
  it("سقف الشارات", () => {
    expect(capCount(0)).toBe("0");
    expect(capCount(9)).toBe("9");
    expect(capCount(10)).toBe("9+");
  });
});
