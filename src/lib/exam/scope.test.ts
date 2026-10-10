import { describe, expect, it, beforeAll } from "vitest";
import { loadQuranCorpus } from "./corpus";
import {
  buildScope,
  isInScope,
  normalizeSegments,
  scopeSurahs,
  segmentLabel,
  surahName,
} from "./scope";

// تحميل المتن يضبط بدايات الأجزاء المطلوبة لنطاق «من جزء إلى جزء».
beforeAll(async () => {
  await loadQuranCorpus();
});

describe("نطاق سورة", () => {
  it("يبني نطاقاً صحيحاً ويصفه باسم السورة", () => {
    const res = buildScope({ kind: "surah", surah: 18, fromAyah: 1, toAyah: 20 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.scope.ayahCount).toBe(20);
    expect(res.scope.label).toContain("الكهف");
    expect(res.scope.label).not.toMatch(/سورة\s*18/);
    expect(isInScope(res.scope, 18, 20)).toBe(true);
    expect(isInScope(res.scope, 18, 21)).toBe(false);
    expect(isInScope(res.scope, 19, 1)).toBe(false);
  });

  it("يرفض آية خارج عدد آيات السورة", () => {
    const res = buildScope({ kind: "surah", surah: 1, fromAyah: 1, toAyah: 20 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0]!.code).toBe("AYAH_OUT_OF_RANGE");
  });

  it("يرفض نطاقاً معكوساً", () => {
    const res = buildScope({ kind: "surah", surah: 2, fromAyah: 50, toAyah: 10 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.code === "REVERSED_AYAH")).toBe(true);
  });

  it("يرفض سورة غير موجودة", () => {
    const res = buildScope({ kind: "surah", surah: 115, fromAyah: 1, toAyah: 3 });
    expect(res.ok).toBe(false);
  });

  it("يرفض نطاقاً أصغر من الحد الأدنى", () => {
    const res = buildScope({ kind: "surah", surah: 2, fromAyah: 5, toAyah: 6 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0]!.code).toBe("TOO_SMALL");
  });
});

describe("نطاق أجزاء", () => {
  it("الجزء الأول يبدأ بالفاتحة وينتهي داخل البقرة", () => {
    const res = buildScope({ kind: "juz", fromJuz: 1, toJuz: 1 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(isInScope(res.scope, 1, 1)).toBe(true);
    expect(isInScope(res.scope, 2, 141)).toBe(true);
    // أول آية من الجزء الثاني (البقرة 142) يجب أن تكون خارج الجزء الأول.
    expect(isInScope(res.scope, 2, 142)).toBe(false);
  });

  it("الجزء الثلاثون ينتهي بآخر آية في المصحف", () => {
    const res = buildScope({ kind: "juz", fromJuz: 30, toJuz: 30 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(isInScope(res.scope, 114, 6)).toBe(true);
    expect(isInScope(res.scope, 78, 1)).toBe(true);
    expect(isInScope(res.scope, 77, 50)).toBe(false);
  });

  it("مجموع آيات الأجزاء الثلاثين = 6236", () => {
    let total = 0;
    for (let juz = 1; juz <= 30; juz += 1) {
      const res = buildScope({ kind: "juz", fromJuz: juz, toJuz: juz });
      expect(res.ok).toBe(true);
      if (res.ok) total += res.scope.ayahCount;
    }
    expect(total).toBe(6236);
  });

  it("يرفض أجزاء معكوسة أو خارج 1–30", () => {
    expect(buildScope({ kind: "juz", fromJuz: 5, toJuz: 2 }).ok).toBe(false);
    expect(buildScope({ kind: "juz", fromJuz: 0, toJuz: 3 }).ok).toBe(false);
    expect(buildScope({ kind: "juz", fromJuz: 1, toJuz: 31 }).ok).toBe(false);
  });
});

describe("نطاق سور", () => {
  it("من البقرة إلى النساء يشمل السور الثلاث كاملة ولا شيء غيرها", () => {
    const res = buildScope({ kind: "surah-range", fromSurah: 2, toSurah: 4 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(scopeSurahs(res.scope)).toEqual([2, 3, 4]);
    expect(res.scope.ayahCount).toBe(286 + 200 + 176);
    expect(isInScope(res.scope, 1, 1)).toBe(false);
    expect(isInScope(res.scope, 5, 1)).toBe(false);
    expect(res.scope.label).toContain("البقرة");
    expect(res.scope.label).toContain("النساء");
  });

  it("يرفض ترتيباً معكوساً بأسماء السور في الرسالة", () => {
    const res = buildScope({ kind: "surah-range", fromSurah: 4, toSurah: 2 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0]!.message).toContain("البقرة");
  });
});

describe("نطاق مخصص", () => {
  it("يجمع عدة مقاطع من سور مختلفة", () => {
    const res = buildScope({
      kind: "custom",
      segments: [
        { surah: 2, fromAyah: 1, toAyah: 20 },
        { surah: 3, fromAyah: 30, toAyah: 50 },
        { surah: 4, fromAyah: 1, toAyah: 10 },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.scope.ayahCount).toBe(20 + 21 + 10);
    expect(res.scope.segments).toHaveLength(3);
    expect(isInScope(res.scope, 3, 29)).toBe(false);
    expect(isInScope(res.scope, 3, 30)).toBe(true);
    expect(res.scope.label).toContain("3 مقاطع");
  });

  it("يدمج المقاطع المتداخلة والمتلاصقة", () => {
    const merged = normalizeSegments([
      { surah: 2, fromAyah: 1, toAyah: 10 },
      { surah: 2, fromAyah: 8, toAyah: 20 },
      { surah: 2, fromAyah: 21, toAyah: 25 },
      { surah: 2, fromAyah: 40, toAyah: 45 },
    ]);
    expect(merged).toEqual([
      { surah: 2, fromAyah: 1, toAyah: 25 },
      { surah: 2, fromAyah: 40, toAyah: 45 },
    ]);
  });

  it("يرفض نطاقاً مخصصاً فارغاً", () => {
    const res = buildScope({ kind: "custom", segments: [] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0]!.code).toBe("EMPTY");
  });

  it("يرفض مقطعاً واحداً فاسداً ضمن مقاطع صحيحة", () => {
    const res = buildScope({
      kind: "custom",
      segments: [
        { surah: 2, fromAyah: 1, toAyah: 20 },
        { surah: 1, fromAyah: 1, toAyah: 99 },
      ],
    });
    expect(res.ok).toBe(false);
  });
});

describe("النطاق مجمَّد بعد البناء", () => {
  it("لا يمكن تعديل المقاطع أو عدد الآيات", () => {
    const res = buildScope({ kind: "surah", surah: 18, fromAyah: 1, toAyah: 20 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.isFrozen(res.scope)).toBe(true);
    expect(Object.isFrozen(res.scope.segments)).toBe(true);
    expect(() => {
      (res.scope.segments[0] as { toAyah: number }).toAyah = 110;
    }).toThrow();
    expect(res.scope.segments[0]!.toAyah).toBe(20);
  });
});

describe("أسماء السور في العرض", () => {
  it("وصف المقطع يستخدم الاسم لا الرقم", () => {
    expect(segmentLabel({ surah: 18, fromAyah: 1, toAyah: 20 })).toBe("الكهف · 1–20");
    expect(segmentLabel({ surah: 1, fromAyah: 1, toAyah: 7 })).toBe("الفاتحة · كاملة");
    expect(surahName(19)).toBe("مريم");
  });
});
