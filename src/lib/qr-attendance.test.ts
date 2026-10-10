import { describe, expect, it } from "vitest";
import { checkInMessage, parseCode, qrPayload, qrSvg, secondsLeft } from "./qr-attendance";

describe("الحضور برمز QR (9.2)", () => {
  it("قراءة الرمز الممسوح والمكتوب", () => {
    expect(parseCode(qrPayload("012345"))).toBe("012345");
    expect(parseCode(" 123 456 ")).toBe("123456");
    expect(parseCode("١٢٣٤٥٦")).toBe("123456");
    expect(parseCode("12345")).toBeNull();
    expect(parseCode("zen-attend:abcdef")).toBeNull();
    expect(parseCode("https://evil.example/123456")).toBeNull();
  });
  it("العدّ التنازلي", () => {
    const now = Date.parse("2026-09-29T10:00:00Z");
    expect(secondsLeft("2026-09-29T10:00:29.200Z", now)).toBe(30);
    expect(secondsLeft("2026-09-29T09:59:00Z", now)).toBe(0);
  });
  it("الرسائل", () => {
    expect(checkInMessage({ status: "checked_in", halaqa: "حلقة الفجر" })).toContain("حلقة الفجر");
    expect(checkInMessage({ status: "invalid" })).toContain("منتهٍ");
  });
  it("QR يُولَّد SVG", async () => {
    const svg = await qrSvg(qrPayload("123456"));
    expect(svg.startsWith("<svg")).toBe(true);
  });
});
