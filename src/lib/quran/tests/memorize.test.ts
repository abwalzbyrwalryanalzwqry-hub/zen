import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  displayOf,
  firstGrapheme,
  maskAyah,
  nextLevel,
  repetitionPlan,
  type MemorizeLevel,
} from "@/lib/quran/memorize";
import type { SurahText } from "@/lib/quran/text-types";

const DATA = fileURLToPath(new URL("../../../../public/data/quran/uthmani/", import.meta.url));
const surah = (id: number): SurahText => JSON.parse(readFileSync(`${DATA}${id}.json`, "utf8"));
const LEVELS: MemorizeLevel[] = [0, 1, 2, 3, 4];

describe("وضع الحفظ (8.1): الإخفاء لا يغيّر النص", () => {
  const samples = [1, 2, 18, 36, 112, 114].flatMap((id) => surah(id).ayahs.slice(0, 12));

  it.each(LEVELS)("المستوى %i: ضمّ المقاطع = نص الآية حرفياً في %s آية", (level) => {
    for (const a of samples)
      expect(
        maskAyah(a.t, level)
          .map((s) => s.text)
          .join(""),
      ).toBe(a.t);
  });

  it("المستوى 0 لا يخفي شيئاً، و4 يخفي كل الكلمات", () => {
    const a = surah(2).ayahs[254].t; // آية الكرسي
    expect(maskAyah(a, 0).some((s) => s.kind === "word" && s.hidden)).toBe(false);
    const all = maskAyah(a, 4).filter((s) => s.kind === "word" && s.index >= 0);
    expect(all.every((s) => s.kind === "word" && s.hidden)).toBe(true);
  });

  it("المستوى 1 يخفي الثلث، و2 النصف تقريباً", () => {
    const words = (l: MemorizeLevel) =>
      maskAyah(surah(2).ayahs[254].t, l).filter((s) => s.kind === "word" && s.index >= 0);
    const ratio = (l: MemorizeLevel) =>
      words(l).filter((s) => s.kind === "word" && s.hidden).length / words(l).length;
    expect(ratio(1)).toBeGreaterThan(0.25);
    expect(ratio(1)).toBeLessThan(0.4);
    expect(ratio(2)).toBeGreaterThan(0.4);
    expect(ratio(2)).toBeLessThan(0.6);
  });

  it("أول حرف مع حركته، وهو بادئة الكلمة الأصلية", () => {
    for (const a of samples)
      for (const s of maskAyah(a.t, 3))
        if (s.kind === "word") expect(s.text.startsWith(s.hint)).toBe(true);
    const first = maskAyah(surah(112).ayahs[0].t, 3)[0];
    expect(first.kind === "word" && first.hint.length).toBeGreaterThan(1); // «قُ» لا «ق»
    expect(firstGrapheme("")).toBe("");
  });

  it("العرض: المخفي فارغ، والمستوى 3 يعرض أول حرف، والكشف يعرض الكلمة", () => {
    const seg = maskAyah(surah(114).ayahs[0].t, 3).find((s) => s.kind === "word")!;
    expect(displayOf(seg, 3, false)).toBe(seg.kind === "word" ? seg.hint : "");
    expect(displayOf(seg, 3, true)).toBe(seg.text);
    const hid = maskAyah(surah(114).ayahs[0].t, 4).find((s) => s.kind === "word")!;
    expect(displayOf(hid, 4, false)).toBeNull();
  });
});

describe("جدول التكرار", () => {
  it("كل آية N مرات ثم الربط بالسابقة ثم المقطع", () => {
    expect(repetitionPlan(1, 3, 3)).toEqual([
      { kind: "ayah", from: 1, to: 1, times: 3 },
      { kind: "ayah", from: 2, to: 2, times: 3 },
      { kind: "link", from: 1, to: 2, times: 1 },
      { kind: "ayah", from: 3, to: 3, times: 3 },
      { kind: "link", from: 2, to: 3, times: 1 },
      { kind: "whole", from: 1, to: 3, times: 1 },
    ]);
  });
  it("آية واحدة بلا ربط، ومدى خاطئ فارغ، والتكرار محصور 1..20", () => {
    expect(repetitionPlan(5, 5, 0)).toEqual([{ kind: "ayah", from: 5, to: 5, times: 1 }]);
    expect(repetitionPlan(5, 4, 3)).toEqual([]);
    expect(repetitionPlan(1, 1, 99)[0].times).toBe(20);
  });
  it("المستوى يتقدّم بالنجاح ويتراجع بالتعثّر ضمن 0..4", () => {
    expect(nextLevel(0, true)).toBe(1);
    expect(nextLevel(4, true)).toBe(4);
    expect(nextLevel(0, false)).toBe(0);
    expect(nextLevel(3, false)).toBe(2);
  });
});
