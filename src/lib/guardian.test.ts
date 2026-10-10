import { describe, expect, it } from "vitest";
import { attendanceRate, formatGuardianCode, normalizeGuardianCode } from "@/lib/guardian";

describe("رموز ربط ولي الأمر", () => {
  it("يوحّد الرمز: يزيل الفواصل والمسافات ويكبّر الحروف", () => {
    expect(normalizeGuardianCode(" ab12c-de345 ")).toBe("AB12CDE345");
  });
  it("يعرض الرمز مجموعتين", () => {
    expect(formatGuardianCode("ab12cde345")).toBe("AB12C-DE345");
  });
});

describe("نسبة الحضور", () => {
  it("لا نسبة دون حصص مسجّلة", () => {
    expect(attendanceRate({ present: 0, late: 0, absent: 0, excused: 0 })).toBeNull();
  });
  it("الحاضر والمتأخر حضور، والغائب وصاحب العذر لا", () => {
    expect(attendanceRate({ present: 6, late: 2, absent: 1, excused: 1 })).toBe(80);
  });
});
