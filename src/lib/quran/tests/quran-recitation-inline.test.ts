import { describe, expect, it } from "vitest";
import { nextTrack } from "@/hooks/quran/use-recitation-player";
import { pageOfAyah, pageStart } from "@/lib/quran/reading-tracker";

/* المرحلة ٦: التلاوة داخل القارئ — تسلسل الآيات وتكرار المقطع ومتابعة الصفحة. */

const base = { continuous: true, range: null, loopsDone: 0 };

describe("الآية التالية في التلاوة", () => {
  it("تتقدم داخل السورة ثم إلى السورة التالية في التلاوة المتصلة", () => {
    expect(nextTrack({ surah: 2, ayah: 10 }, base)).toEqual({ surah: 2, ayah: 11 });
    expect(nextTrack({ surah: 1, ayah: 7 }, base)).toEqual({ surah: 2, ayah: 1 });
  });

  it("تتوقف في آخر السورة بلا تلاوة متصلة، وفي آخر المصحف", () => {
    expect(nextTrack({ surah: 1, ayah: 7 }, { ...base, continuous: false })).toBeNull();
    expect(nextTrack({ surah: 114, ayah: 6 }, base)).toBeNull();
  });

  it("تكرّر المقطع العدد المطلوب ثم تتوقف", () => {
    const range = { surah: 2, from: 3, to: 5, times: 3 };
    expect(nextTrack({ surah: 2, ayah: 4 }, { ...base, range })).toEqual({ surah: 2, ayah: 5 });
    expect(nextTrack({ surah: 2, ayah: 5 }, { ...base, range, loopsDone: 0 })).toEqual({
      surah: 2,
      ayah: 3,
    });
    expect(nextTrack({ surah: 2, ayah: 5 }, { ...base, range, loopsDone: 1 })).toEqual({
      surah: 2,
      ayah: 3,
    });
    expect(nextTrack({ surah: 2, ayah: 5 }, { ...base, range, loopsDone: 2 })).toBeNull();
  });

  it("التكرار بلا حدّ لا ينتهي", () => {
    const range = { surah: 112, from: 1, to: 4, times: 0 };
    expect(nextTrack({ surah: 112, ayah: 4 }, { ...base, range, loopsDone: 99 })).toEqual({
      surah: 112,
      ayah: 1,
    });
  });
});

describe("صفحة الآية", () => {
  it("تطابق بدايات الصفحات المعروفة", () => {
    expect(pageOfAyah(1, 1)).toBe(1);
    expect(pageOfAyah(2, 1)).toBe(2);
    expect(pageOfAyah(2, 255)).toBe(42);
    expect(pageOfAyah(114, 6)).toBe(604);
  });

  it("كل بداية صفحة تعود إلى صفحتها", () => {
    for (let p = 1; p <= 604; p++) {
      const { surah, ayah } = pageStart(p);
      expect(pageOfAyah(surah, ayah)).toBe(p);
    }
  });
});
