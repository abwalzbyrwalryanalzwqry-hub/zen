import { describe, expect, it } from "vitest";
import { certQrPayload, formatVerifyCode, parseVerifyCode } from "./verify";

describe("رمز التحقق من الشهادة (10.2)", () => {
  const code = "ABCDEFGH23456789";
  it("يقبل الرمز من QR ومكتوباً بشرطات وأحرف صغيرة", () => {
    expect(parseVerifyCode(certQrPayload(code))).toBe(code);
    expect(parseVerifyCode(" abcd-efgh-2345-6789 ")).toBe(code);
    expect(parseVerifyCode(formatVerifyCode(code))).toBe(code);
  });
  it("يرفض الطول الخاطئ والحروف الملتبسة", () => {
    expect(parseVerifyCode("ABCDEFGH2345678")).toBeNull();
    expect(parseVerifyCode("ABCDEFGH2345678O")).toBeNull();
    expect(parseVerifyCode("ABCDEFGH23456781")).toBeNull();
    expect(parseVerifyCode("zen-attend:123456")).toBeNull();
  });
  it("يقسّم الرمز أربعاً أربعاً", () => {
    expect(formatVerifyCode(code)).toBe("ABCD-EFGH-2345-6789");
  });
});

describe("studio verification links", () => {
  it("reads the code from the QR deep link and web link", () => {
    const code = "ABCDEFGH23456789";
    expect(parseVerifyCode(`zen://verify?code=${code}`)).toBe(code);
    expect(parseVerifyCode(`https://zen.app/verify?code=${code}&x=1`)).toBe(code);
    expect(parseVerifyCode("zen://verify?code=nope")).toBeNull();
  });
});
