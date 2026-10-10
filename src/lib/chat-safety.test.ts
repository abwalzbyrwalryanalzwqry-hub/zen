import { describe, expect, it } from "vitest";
import { chatSendErrorMessage, fitWithin, hasContactInfo } from "./chat-safety";

describe("كشف معلومات التواصل (مطابق لـ has_contact_info)", () => {
  it("يكشف الهواتف والروابط بالأرقام العربية واللاتينية", () => {
    expect(hasContactInfo("رقمي 77 123 4567")).toBe(true);
    expect(hasContactInfo("كلمني ٧٧١٢٣٤٥٦٧")).toBe(true);
    expect(hasContactInfo("+967 777-123-456")).toBe(true);
    expect(hasContactInfo("ادخل wa.me/abc")).toBe(true);
    expect(hasContactInfo("https://x.com")).toBe(true);
  });
  it("لا يمنع مراجع الآيات والأرقام القصيرة", () => {
    expect(hasContactInfo("راجع البقرة 2:255 ثم آل عمران 1-20")).toBe(false);
    expect(hasContactInfo("حفظت 15 صفحة اليوم")).toBe(false);
  });
});

describe("رسائل أخطاء الإرسال", () => {
  it("تشرح المنع بالعربية", () => {
    expect(chatSendErrorMessage(new Error("CONTACT_INFO_BLOCKED"))).toContain("أرقام الهواتف");
    expect(
      chatSendErrorMessage({ message: "new row violates row-level security policy" }),
    ).toContain("لم يعد");
    expect(chatSendErrorMessage(new Error("fetch failed"))).toContain("الاتصال");
  });
});

describe("تصغير الصور", () => {
  it("يحافظ على النسبة ولا يكبّر الصغيرة", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
