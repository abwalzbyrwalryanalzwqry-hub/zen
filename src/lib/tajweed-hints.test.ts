import { describe, expect, it } from "vitest";
import { countHints, referenceTokens, tajweedHints } from "./tajweed-hints";
import { diffWords } from "./tajweed-diff";

const rules = (t: string) => tajweedHints(t).map((h) => `${h.word}:${h.rule}`);

describe("tajweedHints — قواعد إرشادية على النص العثماني", () => {
  it("المدّ اللازم في «ٱلضَّآلِّينَ» والإظهار في «أَنْعَمْتَ»", () => {
    const r = rules(
      "صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ",
    );
    expect(r).toContain("ٱلضَّآلِّينَ:madd_lazim");
    expect(r).toContain("أَنْعَمْتَ:izhar");
  });

  it("فواتح السور مدّ لازم", () => {
    expect(rules("الٓمٓ")).toEqual(["الٓمٓ:madd_lazim"]);
  });

  it("المنفصل في «بِمَآ أُنزِلَ» والإخفاء في «أُنزِلَ» و«مِن قَبْلِكَ»", () => {
    const r = rules("وَٱلَّذِينَ يُؤْمِنُونَ بِمَآ أُنزِلَ إِلَيْكَ وَمَآ أُنزِلَ مِن قَبْلِكَ");
    expect(r).toContain("بِمَآ:madd_munfasil");
    expect(r).toContain("أُنزِلَ:ikhfa");
    expect(r).toContain("مِن:ikhfa");
    expect(r.filter((x) => x.startsWith("أُنزِلَ"))).toHaveLength(2);
  });

  it("المتّصل في «أُو۟لَٰٓئِكَ» و«سَوَآءٌ»، والغنّة في «إِنَّ» و«مِّن»", () => {
    const r = rules("أُو۟لَٰٓئِكَ عَلَىٰ هُدًۭى مِّن رَّبِّهِمْ");
    expect(r).toContain("أُو۟لَٰٓئِكَ:madd_muttasil");
    expect(r).toContain("مِّن:ghunna");
    expect(r).toContain("مِّن:idgham");
    expect(r).toContain("هُدًۭى:idgham"); // التنوين وبعده ألف مقصورة لا تُنطق
    expect(rules("إِنَّ ٱلَّذِينَ كَفَرُوا۟ سَوَآءٌ عَلَيْهِمْ")).toEqual(
      expect.arrayContaining(["إِنَّ:ghunna", "سَوَآءٌ:madd_muttasil", "سَوَآءٌ:izhar"]),
    );
  });

  it("الإقلاب والإخفاء الشفوي والإدغام الشفوي", () => {
    expect(rules("مِنۢ بَعْدِ")).toContain("مِنۢ:iqlab");
    expect(rules("سَمِيعٌۢ بَصِيرٌ")).toContain("سَمِيعٌۢ:iqlab");
    expect(rules("تَرْمِيهِم بِحِجَارَةٍۢ")).toContain("تَرْمِيهِم:ikhfa_shafawi");
    expect(rules("لَهُم مَّا")).toContain("لَهُم:idgham_shafawi");
  });

  it("الإدغام لا يكون داخل كلمة واحدة، ولا حكم قبل همزة الوصل", () => {
    expect(rules("ٱلدُّنْيَا")).not.toContain("ٱلدُّنْيَا:idgham");
    expect(rules("مِنَ ٱلنَّاسِ").some((x) => x.startsWith("مِنَ:"))).toBe(false);
  });

  it("فهرسة الكلمات تطابق diffWords وتُسقط علامات الوقف", () => {
    const ref = "ذَٰلِكَ ٱلْكِتَٰبُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًۭى لِّلْمُتَّقِينَ";
    const toks = referenceTokens(ref);
    expect(toks).toHaveLength(7);
    const ops = diffWords(ref, ref);
    expect(ops).toHaveLength(7);
    const h = tajweedHints(ref).find((x) => x.rule === "idgham")!;
    expect(h.index).toBe(5);
    expect(toks[h.index]).toBe("هُدًۭى");
  });

  it("countHints يلخّص الأعداد", () => {
    const c = countHints(tajweedHints("بِمَآ أُنزِلَ إِلَيْكَ وَمَآ أُنزِلَ"));
    expect(c.find((x) => x.rule === "madd_munfasil")?.count).toBe(2);
    expect(c.find((x) => x.rule === "ikhfa")?.count).toBe(2);
  });
});
