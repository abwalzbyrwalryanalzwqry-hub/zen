import { describe, expect, it } from "vitest";
import {
  cycleMistake,
  formatDuration,
  mistakeCounts,
  remoteAudioPath,
  suggestGrade,
  type Mistake,
} from "./remote-recitation";

describe("التسميع عن بُعد", () => {
  it("اللمس يدور على أنواع الخطأ ثم يمحوه", () => {
    let m: Mistake[] = [];
    m = cycleMistake(m, 3);
    expect(m).toEqual([{ ayah: 3, type: "hifz" }]);
    m = cycleMistake(m, 1);
    expect(m.map((x) => x.ayah)).toEqual([1, 3]);
    m = cycleMistake(m, 3);
    m = cycleMistake(m, 3);
    m = cycleMistake(m, 3);
    expect(m.find((x) => x.ayah === 3)?.type).toBe("waqf");
    m = cycleMistake(m, 3);
    expect(m).toEqual([{ ayah: 1, type: "hifz" }]);
  });
  it("عدّ الأخطاء لكل نوع", () => {
    expect(
      mistakeCounts([
        { ayah: 1, type: "hifz" },
        { ayah: 2, type: "hifz" },
        { ayah: 5, type: "waqf" },
      ]),
    ).toEqual({ hifz: 2, tajweed: 0, tashkeel: 0, waqf: 1 });
  });
  it("الدرجة المقترحة نسبةً لطول المقطع", () => {
    expect(suggestGrade(0, 10)).toBe(5);
    expect(suggestGrade(1, 10)).toBe(4);
    expect(suggestGrade(2, 10)).toBe(3);
    expect(suggestGrade(5, 10)).toBe(2);
  });
  it("مسار الصوت في مجلد الطالب، والمدة بالدقائق", () => {
    expect(remoteAudioPath("u", "r", "webm", 9)).toBe("u/remote/r-9.webm");
    expect(formatDuration(95)).toBe("1:35");
    expect(formatDuration(null)).toBe("0:00");
  });
});
