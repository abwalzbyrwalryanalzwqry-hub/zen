import { describe, expect, it, beforeAll } from "vitest";
import { loadQuranCorpus, rareWordsIn, verifyQuranIntegrity, type QuranCorpus } from "./corpus";
import { normalizeArabic } from "./text";

let corpus: QuranCorpus;

beforeAll(async () => {
  corpus = await loadQuranCorpus();
});

describe("سلامة نص المصحف", () => {
  it("البصمة وعدد السور والآيات تطابق الملف المرجعي", async () => {
    const report = await verifyQuranIntegrity();
    expect(report.problems).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.surahs).toBe(114);
    expect(report.totalAyahs).toBe(6236);
    expect(report.actual).toBe(report.expected);
  });

  it("عدد آيات كل سورة يطابق بيانات المشروع", () => {
    expect(corpus.ayahs).toHaveLength(6236);
    expect(corpus.surah(1)).toHaveLength(7);
    expect(corpus.surah(2)).toHaveLength(286);
    expect(corpus.surah(18)).toHaveLength(110);
    expect(corpus.surah(114)).toHaveLength(6);
  });

  it("البسملة آية في الفاتحة ومفصولة عن أول آية في غيرها", () => {
    expect(normalizeArabic(corpus.ayah(1, 1)!.text)).toBe("بسم الله الرحمن الرحيم");
    // الكهف تبدأ بـ«الحمد لله» بعد فصل البسملة.
    expect(normalizeArabic(corpus.ayah(18, 1)!.text).startsWith("الحمد لله")).toBe(true);
    // التوبة بلا بسملة أصلاً.
    expect(normalizeArabic(corpus.ayah(9, 1)!.text).startsWith("براءه")).toBe(true);
    for (let surah = 2; surah <= 114; surah += 1) {
      const first = normalizeArabic(corpus.ayah(surah, 1)!.text);
      expect(first.startsWith("بسم الله الرحمن الرحيم")).toBe(false);
    }
  });

  it("لا آية فارغة ولا مسافات زائدة", () => {
    for (const ayah of corpus.ayahs) {
      expect(ayah.text.trim()).toBe(ayah.text);
      expect(ayah.text.length).toBeGreaterThan(0);
      expect(ayah.text).not.toMatch(/\s{2,}/);
    }
  });

  it("النص المعروض يحمل التشكيل، والتطبيع للمقارنة فقط", () => {
    const ayah = corpus.ayah(18, 1)!;
    expect(ayah.text).not.toBe(ayah.normalized);
    expect(ayah.text.length).toBeGreaterThan(ayah.normalized.length);
  });
});

describe("فهرس الكلمات النادرة", () => {
  it("كل كلمة نادرة موجودة فعلاً في آيتها وبتواتر محدود", () => {
    const refs = corpus
      .surah(18)
      .slice(0, 30)
      .map((a) => ({ surah: a.surah, ayah: a.ayah }));
    const rare = rareWordsIn(corpus, refs, 3);
    expect(rare.length).toBeGreaterThan(0);
    for (const entry of rare) {
      const ayah = corpus.ayah(entry.ref.surah, entry.ref.ayah)!;
      expect(corpus.wordsOf(entry.ref)).toContain(entry.word);
      expect(normalizeArabic(ayah.text)).toContain(entry.word);
      expect(entry.frequency).toBeLessThanOrEqual(3);
      expect(entry.frequency).toBeGreaterThanOrEqual(1);
      expect(entry.word.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("الكلمات شديدة الشيوع ليست نادرة", () => {
    expect(corpus.wordFrequency("الله")).toBeGreaterThan(1000);
    const refs = corpus.surah(2).map((a) => ({ surah: a.surah, ayah: a.ayah }));
    const rare = rareWordsIn(corpus, refs, 3);
    expect(rare.some((r) => r.word === "الله")).toBe(false);
  });
});

describe("فهرس المتشابهات", () => {
  it("يجد المتشابه المعروف بين البقرة ٤٨ و١٢٣", () => {
    const similar = corpus.similarTo({ surah: 2, ayah: 48 }, 0.6);
    expect(similar.some((s) => s.ref.surah === 2 && s.ref.ayah === 123)).toBe(true);
  });

  it("لا يُرجع الآية نفسها، والدرجات مرتّبة تنازلياً", () => {
    const similar = corpus.similarTo({ surah: 26, ayah: 105 }, 0.6);
    expect(similar.some((s) => s.ref.surah === 26 && s.ref.ayah === 105)).toBe(false);
    for (let i = 1; i < similar.length; i += 1) {
      expect(similar[i - 1]!.score).toBeGreaterThanOrEqual(similar[i]!.score);
    }
  });
});
