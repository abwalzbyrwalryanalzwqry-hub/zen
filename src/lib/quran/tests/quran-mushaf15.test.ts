import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SURAH_META } from "@/lib/quran/metadata";
import { PAGE_STARTS } from "@/lib/quran/structure-data";
import type { Mushaf15Page } from "@/lib/quran/mushaf15";

/* المرحلة ٥: تخطيط مصحف المدينة ذي الخمسة عشر سطراً. */

const DIR = fileURLToPath(new URL("../../../../public/data/quran/mushaf15/", import.meta.url));
const pages: Mushaf15Page[] = Array.from({ length: 604 }, (_, i) =>
  JSON.parse(readFileSync(`${DIR}${i + 1}.json`, "utf8")),
);

describe("تخطيط مصحف المدينة (١٥ سطراً)", () => {
  it("كل صفحة ١٥ سطراً، والأوليان ٨ أسطر", () => {
    pages.forEach((pg, i) => {
      expect(pg.p).toBe(i + 1);
      expect(pg.l).toHaveLength(i < 2 ? 8 : 15);
    });
  });

  it("الآيات كلها بترتيبها، وكل آية تنتهي بعلامتها، وبداية كل صفحة تطابق بيانات الصفحات", () => {
    let expected = { s: 1, a: 1 };
    let count = 0;
    pages.forEach((pg, i) => {
      let first: [number, number] | null = null;
      for (const line of pg.l) {
        if (!("w" in line)) continue;
        for (const [a, text] of line.w) {
          if (!first) first = [line.s, a];
          if (text !== undefined) {
            expect([line.s, a]).toEqual([expected.s, expected.a]);
          } else {
            expect([line.s, a]).toEqual([expected.s, expected.a]);
            count++;
            expected =
              a === SURAH_META[line.s - 1].ayatCount
                ? { s: line.s + 1, a: 1 }
                : { s: line.s, a: a + 1 };
          }
        }
      }
      expect(first).toEqual([PAGE_STARTS[i][0], PAGE_STARTS[i][1]]);
    });
    expect(count).toBe(6236);
  });

  it("لكل سورة اسمٌ قبل آيتها الأولى، وبسملة عدا الفاتحة والتوبة", () => {
    const flat = pages.flatMap((pg) => pg.l);
    for (let s = 1; s <= 114; s++) {
      const start = flat.findIndex((l) => "w" in l && l.s === s);
      if (s === 1 || s === 9) {
        expect(flat[start - 1]).toEqual({ t: "h", s });
      } else {
        expect(flat[start - 1]).toEqual({ t: "b", s });
        expect(flat[start - 2]).toEqual({ t: "h", s });
      }
    }
    expect(flat.filter((l) => l.t === "h")).toHaveLength(114);
  });
});
