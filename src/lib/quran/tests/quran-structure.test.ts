import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BASMALA, hasBasmalaHeader, stripBasmala } from "@/lib/quran/basmala";
import {
  HIZB_META,
  JUZ_META,
  RUB_META,
  isSajdahAyah,
  rubStartingAt,
} from "@/lib/quran/juz-metadata";
import { SURAH_META } from "@/lib/quran/metadata";
import { MUSHAF_PAGE_COUNT, surahIdsOnPage } from "@/lib/quran/page-service";
import { HIZB_QUARTER_STARTS, PAGE_STARTS, SAJDAH_AYAHS } from "@/lib/quran/structure-data";
import type { SurahText } from "@/lib/quran/text-types";

/* يتحقق من اتساق بنية المصحف (الصفحات، الأجزاء، الأحزاب، السجدات، البسملة)
 * مقابل ملفات النص العثماني المضمّنة نفسها. */

const DATA = fileURLToPath(new URL("../../../../public/data/quran/uthmani/", import.meta.url));
const SURAHS: SurahText[] = Array.from({ length: 114 }, (_, i) =>
  JSON.parse(readFileSync(`${DATA}${i + 1}.json`, "utf8")),
);
const ALL = SURAHS.flatMap((s) => s.ayahs.map((a) => ({ surah: s.id, ...a })));

describe("ملفات النص", () => {
  it("تحتوي ٦٢٣٦ آية و٦٠٤ صفحات", () => {
    expect(ALL).toHaveLength(6236);
    expect(new Set(ALL.map((a) => a.p)).size).toBe(MUSHAF_PAGE_COUNT);
  });
});

describe("البيانات الوصفية للسور", () => {
  it("نطاقات الصفحات والأجزاء وعدد الآيات مطابقة للنص", () => {
    for (const s of SURAHS) {
      const meta = SURAH_META[s.id - 1];
      const pages = s.ayahs.map((a) => a.p);
      const juz = s.ayahs.map((a) => a.j);
      expect(meta.ayatCount, `سورة ${s.id}`).toBe(s.ayahs.length);
      expect(meta.pages, `صفحات سورة ${s.id}`).toEqual({
        start: Math.min(...pages),
        end: Math.max(...pages),
      });
      expect(meta.juz, `أجزاء سورة ${s.id}`).toEqual({
        start: Math.min(...juz),
        end: Math.max(...juz),
      });
    }
  });

  it("بداية كل جزء مطابقة للنص", () => {
    for (const j of JUZ_META) {
      const first = ALL.find((a) => a.j === j.id)!;
      expect({ surah: first.surah, ayah: first.n, page: first.p }).toEqual({
        ...j.start,
        page: j.startPage,
      });
    }
  });
});

describe("الصفحات", () => {
  it("PAGE_STARTS تطابق أول آية في كل صفحة", () => {
    expect(PAGE_STARTS).toHaveLength(604);
    for (let p = 1; p <= 604; p++) {
      const first = ALL.find((a) => a.p === p)!;
      expect(PAGE_STARTS[p - 1], `صفحة ${p}`).toEqual([first.surah, first.n]);
    }
  });

  it("surahIdsOnPage تغطي كل آيات الصفحة بلا نقص", () => {
    let total = 0;
    for (let p = 1; p <= 604; p++) {
      const ids = surahIdsOnPage(p);
      const onPage = ALL.filter((a) => a.p === p);
      expect(ids, `صفحة ${p}`).toEqual([...new Set(onPage.map((a) => a.surah))]);
      total += onPage.length;
    }
    expect(total).toBe(6236);
  });
});

describe("الأحزاب والأرباع والسجدات", () => {
  it("٢٤٠ ربعاً و٦٠ حزباً مرتبة، وكل حزبين في جزء", () => {
    expect(HIZB_QUARTER_STARTS).toHaveLength(240);
    expect(RUB_META).toHaveLength(240);
    expect(HIZB_META).toHaveLength(60);
    for (let i = 0; i < 30; i++) {
      expect(HIZB_META[i * 2].start, `الجزء ${i + 1}`).toEqual(JUZ_META[i].start);
    }
    const order = (s: number, a: number) => s * 1000 + a;
    for (let i = 1; i < 240; i++) {
      const [s0, a0] = HIZB_QUARTER_STARTS[i - 1];
      const [s1, a1] = HIZB_QUARTER_STARTS[i];
      expect(order(s1, a1)).toBeGreaterThan(order(s0, a0));
    }
  });

  it("علامة الربع ۞ في النص تقع عند بدايات الأرباع", () => {
    for (const a of ALL) {
      if (a.t.includes("۞")) expect(rubStartingAt(a.surah, a.n), `${a.surah}:${a.n}`).toBeTruthy();
    }
  });

  it("السجدات الخمس عشرة مطابقة لعلامة ۩ في النص", () => {
    expect(SAJDAH_AYAHS).toHaveLength(15);
    const marked = ALL.filter((a) => a.t.includes("۩"));
    expect(marked.map((a) => [a.surah, a.n])).toEqual(SAJDAH_AYAHS.map((x) => [...x]));
    expect(isSajdahAyah(96, 19)).toBe(true);
    expect(isSajdahAyah(96, 18)).toBe(false);
  });
});

describe("البسملة", () => {
  it("تُفصل عن الآية الأولى في كل السور عدا الفاتحة والتوبة", () => {
    for (const s of SURAHS) {
      const first = s.ayahs[0];
      const out = stripBasmala(s.id, 1, first.t);
      if (hasBasmalaHeader(s.id)) {
        expect(out.length, `سورة ${s.id}`).toBeLessThan(first.t.length);
        expect(out.startsWith("بِ"), `سورة ${s.id}: ${out.slice(0, 20)}`).toBe(false);
        expect(out.trim().length).toBeGreaterThan(0);
      } else {
        expect(out).toBe(first.t.replace(/\uFEFF/g, ""));
      }
    }
  });

  it("أمثلة: البقرة تبدأ بـ «الم» والتين والقدر رغم الشدّة الزائدة", () => {
    expect(stripBasmala(2, 1, SURAHS[1].ayahs[0].t)).toBe("الٓمٓ");
    expect(stripBasmala(95, 1, SURAHS[94].ayahs[0].t).startsWith("وَ")).toBe(true);
    expect(stripBasmala(97, 1, SURAHS[96].ayahs[0].t)).toBe(
      SURAHS[96].ayahs[0].t.split(" ").slice(4).join(" "),
    );
    expect(SURAHS[96].ayahs[0].t.split(" ")).toHaveLength(9);
  });

  it("لا تمس غير الآية الأولى، وثابت العرض مطابق للفاتحة", () => {
    expect(stripBasmala(27, 30, SURAHS[26].ayahs[29].t)).toBe(SURAHS[26].ayahs[29].t);
    expect(BASMALA).toBe(SURAHS[0].ayahs[0].t);
  });
});
