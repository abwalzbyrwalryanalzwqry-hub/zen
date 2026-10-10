import { describe, expect, it } from "vitest";
import { diffWords, summarizeDiff } from "./tajweed-diff";

describe("مقارنة الكلمات (tajweed-diff)", () => {
  it("كلمات زائدة بعد نهاية المقطع تُعدّ ولا تعلّق الحلقة (تدقيق أكتوبر 2026)", () => {
    const ops = diffWords("قل هو الله احد", "قل هو الله احد الله الصمد");
    expect(ops.filter((o) => o.op === "extra").map((o) => ("said" in o ? o.said : ""))).toEqual([
      "الله",
      "الصمد",
    ]);
    const d = summarizeDiff("قل هو الله احد", "قل هو الله احد الله الصمد");
    expect(d.extra).toBe(2);
    expect(d.score).toBe(75);
  });

  it("تكرار آخر كلمة وزيادة في الوسط والنقص", () => {
    expect(summarizeDiff("الله الصمد", "الله الصمد الصمد").extra).toBe(1);
    expect(summarizeDiff("قل هو الله احد", "قل الله احد").missing).toBe(1);
    expect(summarizeDiff("قل هو الله احد", "قل هو الله احد").score).toBe(100);
  });

  it("تفريغ فارغ = كل الكلمات ناقصة، ومرجع فارغ لا يقسم على صفر", () => {
    expect(summarizeDiff("قل هو", "").missing).toBe(2);
    expect(summarizeDiff("", "قل").extra).toBe(1);
  });
});
