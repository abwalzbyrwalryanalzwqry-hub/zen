import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import divisions from "@/data/quran-divisions.json";
import {
  MUSHAF_TOTAL_PAGES,
  hizbOfPage,
  isAyahLine,
  isValidPage,
  juzOfPage,
  mushafPageUrl,
  surahsOnPage,
  type Mushaf15Page,
} from "./mushaf15";

const DIR = join(process.cwd(), "public/data/quran/mushaf15");
const read = (p: number) => JSON.parse(readFileSync(join(DIR, `${p}.json`), "utf8")) as unknown;

describe("mushaf15 — ملفات المصحف المضمَّنة", () => {
  it("604 صفحة صالحة، وكل صفحة 15 سطراً على الأكثر", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(MUSHAF_TOTAL_PAGES);
    for (let p = 1; p <= MUSHAF_TOTAL_PAGES; p++) {
      const d = read(p);
      expect(isValidPage(d, p)).toBe(true);
      expect((d as Mushaf15Page).l.length).toBeLessThanOrEqual(15);
    }
  });

  it("أول آية في كل صفحة تطابق بيانات Tanzil المستعملة في بقية التطبيق", () => {
    const starts = divisions.pageStarts as unknown as [number, number][];
    for (let p = 1; p <= MUSHAF_TOTAL_PAGES; p++) {
      const d = read(p) as Mushaf15Page;
      const first = d.l.find(isAyahLine)!;
      expect([first.s, first.w[0][0]], `الصفحة ${p}`).toEqual(starts[p - 1]);
    }
  });

  it("الحجم الكلي أقل من 3 ميغابايت (كان 73 ميغابايت صوراً)", () => {
    const total = readdirSync(DIR).reduce((n, f) => n + statSync(join(DIR, f)).size, 0);
    expect(total).toBeLessThan(3 * 1024 * 1024);
  });

  it("الجزء والحزب والسور في الصفحة", () => {
    expect(juzOfPage(1)).toBe(1);
    expect(juzOfPage(21)).toBe(1);
    expect(juzOfPage(22)).toBe(2);
    expect(juzOfPage(582)).toBe(30);
    expect(juzOfPage(604)).toBe(30);
    expect(hizbOfPage(604)).toBe(60);
    expect(surahsOnPage(read(1) as Mushaf15Page)).toEqual([1]);
    expect(surahsOnPage(read(604) as Mushaf15Page)).toEqual([112, 113, 114]);
    expect(mushafPageUrl(7)).toBe("/data/quran/mushaf15/7.json");
  });
});
