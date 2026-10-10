import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { stripBasmala } from "@/lib/quran/basmala";
import {
  normalizeArabic,
  quranSkeleton,
  tokenizeArabic,
  wordMatchesToken,
} from "@/lib/quran/normalize";
import { quranRepository } from "@/lib/quran/repository";
import { quranSearchService, searchSurahNames } from "@/lib/quran/search-service";
import type { SurahText } from "@/lib/quran/text-types";

/* البحث يجب أن يجد ما يكتبه المستخدم بالإملاء الحديث في النص العثماني. */

const DATA = fileURLToPath(new URL("../../../../public/data/quran/uthmani/", import.meta.url));

beforeAll(() => {
  const surahs: SurahText[] = Array.from({ length: 114 }, (_, i) => {
    const s = JSON.parse(readFileSync(`${DATA}${i + 1}.json`, "utf8")) as SurahText;
    // كما تفعل خدمة النص عند التحميل.
    s.ayahs = s.ayahs.map((a) => ({ ...a, t: stripBasmala(s.id, a.n, a.t) }));
    return s;
  });
  quranSearchService.indexSurahs(surahs);
});

const ref = (q: string) =>
  quranSearchService.search(q, { limit: 5 }).map((h) => `${h.surah}:${h.ayah}`);

describe("هيكل الرسم", () => {
  it("يوحّد الرسم العثماني والإملائي", () => {
    const pairs: [string, string][] = [
      ["ٱلصَّلَوٰةَ", "الصلاة"],
      ["ٱلزَّكَوٰةَ", "الزكاة"],
      ["ٱلْحَيَوٰةِ", "الحياة"],
      ["ٱلْكِتَٰبُ", "الكتاب"],
      ["ٱلْقُرْءَانَ", "القرآن"],
      ["إِبْرَٰهِـۧمَ", "إبراهيم"],
      ["ٱلسَّمَٰوَٰتِ", "السماوات"],
      ["ٱلرَّحْمَٰنِ", "الرحمن"],
      ["ذَٰلِكَ", "ذلك"],
      ["أُو۟لَٰٓئِكَ", "أولئك"],
      ["يَسْـَٔلُونَ", "يسألون"],
      ["بِهِۦ", "به"],
      ["دَاوُۥدَ", "داود"],
    ];
    for (const [uthmani, imlaei] of pairs) {
      expect(quranSkeleton(uthmani), `${uthmani} ↔ ${imlaei}`).toBe(quranSkeleton(imlaei));
    }
  });

  it("يطابق الكلمة مع سوابقها فقط لا في وسط كلمة أخرى", () => {
    expect(wordMatchesToken(quranSkeleton("وَبِٱلْءَاخِرَةِ"), quranSkeleton("الآخرة"))).toBe(true);
    expect(wordMatchesToken(quranSkeleton("فَلِلَّهِ"), quranSkeleton("لله"))).toBe(true);
    expect(wordMatchesToken(quranSkeleton("حُدُودُ"), quranSkeleton("داود"))).toBe(false);
    expect(tokenizeArabic("يا أيها")).toEqual(["يه"]);
  });
});

describe("البحث في النص الكامل", () => {
  it("يجد الكلمات الشائعة التي كانت تعيد صفر نتائج", () => {
    for (const q of [
      "القرآن",
      "الصلاة",
      "الزكاة",
      "إبراهيم",
      "السماوات",
      "إسرائيل",
      "الحياة الدنيا",
    ]) {
      expect(quranSearchService.count(q), q).toBeGreaterThan(10);
    }
  });

  it("يرتّب الآية المقصودة أولاً في العبارات المعروفة", () => {
    expect(ref("ذلك الكتاب لا ريب فيه")[0]).toBe("2:2");
    expect(ref("قل هو الله أحد")[0]).toBe("112:1");
    expect(ref("الله لا إله إلا هو الحي القيوم")).toContain("2:255");
    expect(ref("إنا أنزلناه في ليلة القدر")[0]).toBe("97:1");
  });

  it("العبارة المتصلة تُقدَّم وتحصر النتائج ولو اندمجت كلماتها في الرسم", () => {
    expect(quranSearchService.count("يا أيها الذين آمنوا")).toBe(89);
    expect(ref("لا إله إلا الله").sort()).toEqual(["37:35", "47:19"]);
    expect(ref("رب العالمين")[0]).toBe("1:2");
  });

  it("الإملاء المطابق يتقدّم على الكلمات المتشابهة في الهيكل", () => {
    const top = quranSearchService.search("مائة", { limit: 3 });
    expect(top.every((h) => normalizeArabic(h.text).includes("مايه"))).toBe(true);
  });

  it("البسملة لم تعد تُحتسب في أول كل سورة", () => {
    const hits = quranSearchService.search("بسم الله الرحمن الرحيم", { limit: 10 });
    expect(hits.map((h) => `${h.surah}:${h.ayah}`).sort()).toEqual(["1:1", "27:30"]);
  });

  it("النطاق يحصر النتائج في السورة أو الجزء", () => {
    const inSurah = quranSearchService.search("موسى", { scope: "surah", surah: 20, limit: 500 });
    expect(inSurah.length).toBeGreaterThan(5);
    expect(inSurah.every((h) => h.surah === 20)).toBe(true);
    const inJuz = quranSearchService.search("الجنة", { scope: "juz", juz: 30, limit: 500 });
    expect(inJuz.every((h) => h.juz === 30)).toBe(true);
  });

  it("query يعيد العدد الكلي مع النتائج المحدودة", () => {
    const r = quranSearchService.query("الأرض", { limit: 5 });
    expect(r.hits).toHaveLength(5);
    expect(r.total).toBe(quranSearchService.count("الأرض"));
    expect(r.total).toBeGreaterThan(100);
  });
});

describe("البحث باسم السورة", () => {
  it("يتجاهل الهمزات والتعريف ويقبل الرقم", () => {
    expect(searchSurahNames("الانعام").map((s) => s.id)).toContain(6);
    expect(searchSurahNames("الاسراء").map((s) => s.id)).toContain(17);
    expect(searchSurahNames("٣٦").map((s) => s.id)).toEqual([36]);
    expect(quranRepository.findSurahByName("الانفال").map((s) => s.id)).toContain(8);
  });
});
