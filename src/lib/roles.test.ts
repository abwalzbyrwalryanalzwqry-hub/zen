import { describe, expect, it } from "vitest";
import { activationError, normalizeRoleCode } from "./roles";

describe("رمز «أنا معلّم»", () => {
  it("يوحّد الرمز كقاعدة البيانات: حروف وأرقام بأحرف كبيرة", () => {
    expect(normalizeRoleCode(" zen-abcde 12345-fffff ")).toBe("ZENABCDE12345FFFFF");
    expect(normalizeRoleCode("a1b2c3d4e5")).toBe("A1B2C3D4E5");
  });

  it("النجاح بلا رسالة خطأ، والفشل برسالة عربية لكل حالة", () => {
    for (const ok of ["invite", "founder", "already"] as const) {
      expect(activationError(ok)).toBeNull();
    }
    expect(activationError("invalid")).toContain("غير صحيح");
    expect(activationError("used")).toContain("مستخدم");
    expect(activationError("expired")).toContain("صلاحية");
    expect(activationError("locked")).toContain("ساعة");
  });
});

describe("رمز المؤسس داخل التطبيق", () => {
  it("يعرض الرمز لصاحب التطبيق فقط، وأي رد غير متوقَّع لا يكشف شيئاً", async () => {
    const { parseFounderCodeForMe } = await import("./roles");
    expect(
      parseFounderCodeForMe({ status: "owner", code: " ZEN-ABCDE-12345-FFFFF-00000 " }),
    ).toEqual({
      status: "owner",
      code: "ZEN-ABCDE-12345-FFFFF-00000",
    });
    expect(parseFounderCodeForMe({ status: "already" })).toEqual({ status: "already" });
    expect(parseFounderCodeForMe({ status: "not_owner" })).toEqual({ status: "not_owner" });
    expect(parseFounderCodeForMe({ status: "owner" })).toEqual({ status: "not_owner" });
    expect(parseFounderCodeForMe(null)).toEqual({ status: "not_owner" });
  });
});
