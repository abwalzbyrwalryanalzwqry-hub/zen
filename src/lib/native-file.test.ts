import { describe, expect, it } from "vitest";
import { blobToBase64, safeFileName, stripAutoPrint } from "./native-file";

describe("حفظ الملفات في تطبيق Android (6.11)", () => {
  it("اسم ملف آمن يبقي العربية ويزيل فواصل المسار والرموز الممنوعة", () => {
    expect(safeFileName("تقرير-أحمد/محمد:2026?.xlsx")).toBe("تقرير-أحمد-محمد-2026-.xlsx");
    expect(safeFileName("../../etc/passwd")).toBe("etc-passwd");
    expect(safeFileName("   ")).toBe("zen");
    expect(safeFileName("a".repeat(300))).toHaveLength(120);
  });

  it("base64 مطابق لـ Buffer حتى للملفات الكبيرة", async () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) % 256);
    const b64 = await blobToBase64(new Blob([bytes]));
    expect(b64).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("يزيل أمر الطباعة التلقائي ويبقي المحتوى", () => {
    const html =
      "<body><h1>تقرير</h1><script>window.onload = () => setTimeout(() => window.print(), 350);</script></body>";
    expect(stripAutoPrint(html)).toBe("<body><h1>تقرير</h1></body>");
  });
});
