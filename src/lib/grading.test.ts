import { describe, expect, it } from "vitest";
import { GRADE_PRESETS, gradeKeyOf5, gradeLabel, gradeOf, initialReview } from "./grading";
import { checkAyahRange, clampRange, surahByName } from "./assignment-form";

describe("ميزان التقييم", () => {
  it("كل زر سريع يقع في تقديره", () => {
    for (const g of GRADE_PRESETS) expect(gradeOf(g.score)).toBe(g.key);
  });
  it("الحدود", () => {
    expect(gradeOf(90)).toBe("excellent");
    expect(gradeOf(89)).toBe("veryGood");
    expect(gradeOf(80)).toBe("veryGood");
    expect(gradeOf(70)).toBe("good");
    expect(gradeOf(50)).toBe("pass");
    expect(gradeOf(49)).toBe("weak");
    expect(gradeLabel("veryGood")).toBe("جيد جداً");
  });
  it("لا درجة افتراضية بلا تحليل آلي (لا تحيّز لـ 85)", () => {
    expect(initialReview(null)).toEqual({ score: null, suggested: false, errs: [], notes: "" });
    expect(initialReview(undefined).score).toBeNull();
  });
  it("درجة التحليل الآلي مقترحة ومقصوصة إلى 0–100", () => {
    expect(initialReview(92)).toMatchObject({ score: 92, suggested: true });
    expect(initialReview(130).score).toBe(100);
    expect(initialReview(-4).score).toBe(0);
  });
  it("كل بطاقة تبدأ بنسخة مستقلة (لا مشاركة مصفوفة الأخطاء)", () => {
    const a = initialReview(null);
    const b = initialReview(null);
    a.errs.push("المدود");
    expect(b.errs).toEqual([]);
  });
});

describe("تحقق نطاق الواجب", () => {
  it("سورة معروفة ونطاق داخل حدودها", () => {
    expect(checkAyahRange("الملك", 1, 30).ok).toBe(true);
    expect(checkAyahRange(" الفاتحة ", 7, 7).ok).toBe(true);
  });
  it("يرفض السورة المجهولة والنطاق المعكوس أو الزائد أو غير الصحيح", () => {
    expect(checkAyahRange("الملكك", 1, 5)).toEqual({ ok: false, surah: null });
    expect(checkAyahRange("الملك", 20, 5).ok).toBe(false);
    expect(checkAyahRange("الملك", 1, 31).ok).toBe(false);
    expect(checkAyahRange("الملك", 0, 3).ok).toBe(false);
    expect(checkAyahRange("الملك", 1.5, 3).ok).toBe(false);
  });
  it("clampRange عند تغيير السورة", () => {
    const fatiha = surahByName("الفاتحة")!;
    expect(clampRange(fatiha, 1, 20)).toEqual([1, 7]);
    expect(clampRange(fatiha, 9, 12)).toEqual([7, 7]);
    expect(clampRange(fatiha, 3, 1)).toEqual([3, 3]);
  });
});

describe("درجة سجل الحلقة بتقديرات التسميع", () => {
  it("5 ممتاز و1 ضعيف، والقيم الشاذة تُقصّ", () => {
    expect(gradeKeyOf5(5)).toBe("excellent");
    expect(gradeKeyOf5(4)).toBe("veryGood");
    expect(gradeKeyOf5(1)).toBe("weak");
    expect(gradeKeyOf5(9)).toBe("excellent");
    expect(gradeKeyOf5(0)).toBe("weak");
  });
});
