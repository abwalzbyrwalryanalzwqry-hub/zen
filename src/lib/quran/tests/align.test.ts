import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { alignRecitation, wordMatch } from "@/lib/quran/align";

const DATA = fileURLToPath(new URL("../../../../public/data/quran/uthmani/", import.meta.url));
const ayah = (s: number, a: number): string =>
  JSON.parse(readFileSync(`${DATA}${s}.json`, "utf8")).ayahs[a - 1].t;

/** رمز مختصر لكل كلمة مرجعية: o صحيح، m ساقط، w خطأ، p لم يُبلغ. */
const code = (r: ReturnType<typeof alignRecitation>) =>
  r.words.map((w) => ({ ok: "o", missed: "m", wrong: "w", pending: "p" })[w.status]).join("");

// 20 حالة ثابتة على آيات حقيقية: [سورة، آية، ما سُمع (إملائي كما يخرجه التفريغ)، جارٍ؟، الرمز، الزوائد، التوقف]
const CASES: Array<[string, number, number, string, boolean, string, number, number]> = [
  ["الفاتحة 2 تامة", 1, 2, "الحمد لله رب العالمين", false, "oooo", 0, 4],
  ["الفاتحة 5 تامة", 1, 5, "إياك نعبد وإياك نستعين", false, "oooo", 0, 4],
  [
    "رسم عثماني/إملائي: الصلوة/الصلاة",
    2,
    3,
    "الذين يؤمنون بالغيب ويقيمون الصلاة ومما رزقناهم ينفقون",
    false,
    "oooooooo",
    0,
    8,
  ],
  ["رموز الوقف لا تُعدّ كلمات", 2, 2, "ذلك الكتاب لا ريب فيه هدى للمتقين", false, "ooooooo", 0, 7],
  ["كلمة ساقطة في الوسط", 1, 2, "الحمد لله العالمين", false, "oomo", 0, 4],
  ["كلمة مبدلة", 1, 5, "إياك نعبد وإياك نستغفر", false, "ooow", 0, 4],
  ["كلمة زائدة", 1, 2, "الحمد لله رب رب العالمين", false, "oooo", 1, 4],
  ["توقف مبكر في غير الجاري = ساقط", 1, 7, "صراط الذين أنعمت عليهم", false, "oooommmmm", 0, 4],
  [
    "توقف مبكر في الجاري = لم يُبلغ",
    1,
    7,
    "صراط الذين أنعمت عليهم",
    true,
    "oooopppp p".replace(" ", ""),
    0,
    4,
  ],
  [
    "جارٍ: خطأ قبل التوقف يبقى خطأ",
    1,
    7,
    "صراط الذين أنعمت عليهم غير المغضوب علينا",
    true,
    "oooooowpp",
    0,
    7,
  ],
  ["لا شيء مسموع", 112, 2, "", false, "mm", 0, 0],
  ["لا شيء مسموع (جارٍ)", 112, 2, "", true, "pp", 0, 0],
  ["الإخلاص 2 تامة", 112, 2, "الله الصمد", false, "oo", 0, 2],
  ["آية بالبسملة", 114, 1, "بسم الله الرحمن الرحيم قل أعوذ برب الناس", false, "oooooooo", 0, 8],
  ["تقديم وتأخير = خطآن", 103, 2, "إن لفي الإنسان خسر", false, "owwo", 0, 4],
  [
    "كلمة في آخرها زائدة",
    108,
    1,
    "بسم الله الرحمن الرحيم إنا أعطيناك الكوثر يا رب",
    false,
    "ooooooo",
    2,
    7,
  ],
  [
    "الكرسي: بداية صحيحة جارية",
    2,
    255,
    "الله لا إله إلا هو الحي القيوم",
    true,
    "ooooooo" + "p".repeat(43),
    0,
    7,
  ],
  [
    "شيء/شيء مع ياء مختلفة",
    67,
    1,
    "بسم الله الرحمن الرحيم تبارك الذي بيده الملك وهو على كل شيء قدير",
    false,
    "ooooooooooooo",
    0,
    13,
  ],
  ["يس بحروف مقطعة", 36, 1, "بسم الله الرحمن الرحيم يس", false, "ooooo", 0, 5],
  ["كلمتان ساقطتان متتاليتان", 2, 3, "الذين يؤمنون بالغيب رزقناهم ينفقون", false, "ooommmoo", 0, 8],
];

describe("مطابقة التلاوة كلمةً كلمة (8.3)", () => {
  it.each(CASES)("%s", (_n, s, a, heard, partial, expected, extras, stop) => {
    const r = alignRecitation(ayah(s, a), heard, { partial });
    expect(code(r)).toBe(expected);
    expect(r.extra.length).toBe(extras);
    expect(r.stop).toBe(stop);
  });

  it("الكلمات المرجعية تبقى بنصها العثماني وموضعها", () => {
    const t = ayah(1, 5);
    const r = alignRecitation(t, "إياك نعبد وإياك نستغفر");
    expect(r.words.map((w) => w.text).join(" ")).toBe(t);
    expect(r.words[3]).toMatchObject({ status: "wrong", heard: "نستغفر" });
    expect(r.counts).toEqual({ ok: 3, missed: 0, wrong: 1, extra: 0 });
    expect(r.accuracy).toBe(0.75);
  });

  it("الزائدة تُعلَّم بموضعها", () => {
    const r = alignRecitation(ayah(1, 2), "الحمد لله رب رب العالمين");
    // «رب» المكرّرة: الأولى زائدة قبل «رب» المرجعية (الموضع 2).
    expect(r.extra).toEqual([{ text: "رب", before: 2 }]);
  });

  it("تشابه الرسم", () => {
    expect(wordMatch("الكتب", "الكتاب")).toBeGreaterThanOrEqual(0.75);
    expect(wordMatch("نستعين", "نستغفر")).toBeLessThan(0.75);
  });
});
