import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { isSeedStory, seedStories, type Story } from "./zen-lms";
import { matchesStory, normalizeArabic } from "./stories-filter";
import { MAX_SHOWN_AYAT, storyAyahRefs, storySources } from "./stories-view";
import { SURAHS } from "./quran-meta";

const seed = JSON.parse(readFileSync("public/data/stories/seed.json", "utf8")) as {
  stories: Story[];
};
const quran = JSON.parse(readFileSync("src/data/quran-uthmani.json", "utf8")) as {
  surahs: { name: string; ayahs: string[] }[];
};

describe("قصص الأنبياء المضمَّنة (M13)", () => {
  it("الأنبياء الخمسة والعشرون بالترتيب، والقصص الخمس الأصلية بمقدّماتها كما في ترحيلها الأول", () => {
    const sql = readFileSync(
      "supabase/migrations/20260906005126_24f4e2ad-45bf-4d12-8cbf-3ad785d6de18.sql",
      "utf8",
    );
    expect(seed.stories).toHaveLength(25);
    expect(seed.stories.map((s) => s.slug)).toEqual([
      "adam", "idris", "nuh", "hud", "salih", "ibrahim", "lut", "ismail", "ishaq", "yaqub",
      "yusuf", "ayyub", "shuayb", "musa", "harun", "dhulkifl", "dawud", "sulayman", "ilyas",
      "alyasa", "yunus", "zakariya", "yahya", "isa", "muhammad",
    ]); // prettier-ignore
    const legacy = ["nuh", "ibrahim", "musa", "yusuf", "muhammad"];
    for (const s of seed.stories.filter((x) => legacy.includes(x.slug ?? ""))) {
      expect(sql).toContain(s.intro.replace(/'/g, "''"));
      expect(sql).toContain(`'${s.title}'`);
    }
    expect(seed.stories.filter((s) => s.ulul_azm).map((s) => s.slug)).toEqual([
      "nuh", "ibrahim", "musa", "isa", "muhammad",
    ]); // prettier-ignore
  });

  it("كل قصة كاملة: أحداث وآيات صحيحة المدى ومفردات وعبر واختبار بشرح ومصادر بروابط", () => {
    seed.stories.forEach((s, i) => {
      expect(isSeedStory(s.id)).toBe(true);
      expect(s.id).toBe(`seed-${i + 1}`);
      expect(s.sort_order).toBe(i + 1);
      expect(s.timeline.length).toBeGreaterThanOrEqual(4);
      expect(s.vocabulary.length).toBeGreaterThanOrEqual(2);
      expect(s.lessons?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(s.quiz.length).toBeGreaterThanOrEqual(3);
      for (const q of s.quiz) {
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.options.length);
        expect(q.explain?.length ?? 0).toBeGreaterThan(5);
      }
      expect(s.sources?.length ?? 0).toBeGreaterThan(0);
      for (const src of s.sources ?? []) expect(src.url).toMatch(/^https?:\/\//);
      for (const a of s.ayat) {
        const surah = quran.surahs[(a.n ?? 0) - 1];
        expect(surah?.name, `${s.slug} ${a.surah}`).toBe(a.surah);
        expect(SURAHS[(a.n ?? 0) - 1].name).toBe(a.surah);
        expect(a.from).toBeGreaterThanOrEqual(1);
        expect(a.to).toBeGreaterThanOrEqual(a.from);
        expect(a.to).toBeLessThanOrEqual(surah.ayahs.length);
      }
    });
  });

  it("عدد مرات ذكر الاسم يطابق نص المصحف المضمَّن (للأسماء التي لا تلتبس بكلمات أخرى)", () => {
    const words = quran.surahs
      .flatMap((s) => s.ayahs)
      .join(" ")
      .replace(/[ۦۥ]/g, "")
      .replace(/ىٰ/g, "ى")
      .split(/\s+/)
      .map((w) => normalizeArabic(w).replace(/[^\u0621-\u064A]/g, ""));
    const count = (re: RegExp) => words.filter((w) => re.test(w)).length;
    // الاسم مع حروف العطف والجر و«يا» الملتصقة وألف تنوين النصب، بالرسم العثماني بعد التطبيع.
    const name = (n: string) => new RegExp(`^(و|ف)?(ل|ب|ي)?${n}ا?$`);
    const expected: Record<string, RegExp> = {
      adam: name("ء?ادم"),
      nuh: name("نوح"),
      lut: name("لوط"),
      ishaq: name("اسحق"),
      yaqub: name("يعقوب"),
      yusuf: name("يوسف"),
      shuayb: name("شعيب"),
      musa: name("موسي"),
      harun: name("هرون"),
      dawud: name("داود"),
      sulayman: name("سليمن"),
      zakariya: name("زكريا"),
      isa: name("عيسي"),
    };
    for (const [slug, re] of Object.entries(expected)) {
      const s = seed.stories.find((x) => x.slug === slug);
      expect(count(re), slug).toBe(s?.mentions);
    }
  });

  it("ترحيل قاعدة البيانات مولَّد من الملف نفسه ولا يكتب فوق قصة عدّلها معلّم", () => {
    const out = execFileSync(process.execPath, ["scripts/gen-stories-migration.mjs", "--check"], {
      encoding: "utf8",
    });
    expect(out).toContain("up to date");
    const sql = readFileSync("supabase/migrations/20261201100000_prophet_stories.sql", "utf8");
    expect(sql).toContain("WHERE st.updated_at = st.created_at");
    expect(sql).toContain("ENABLE TRIGGER update_stories_updated_at");
  });

  it("تُقرأ من الملف المضمَّن", async () => {
    const fake = (async () =>
      new Response(JSON.stringify(seed), { status: 200 })) as unknown as typeof fetch;
    const list = await seedStories(fake);
    expect(list).toHaveLength(25);
  });
});

describe("بحث القصص وعرض آياتها", () => {
  const yunus = seed.stories.find((s) => s.slug === "yunus")!;
  it("البحث يتجاهل التشكيل وصور الألف والتاء المربوطة", () => {
    expect(matchesStory(yunus, "يُونُس")).toBe(true);
    expect(matchesStory(yunus, "نينوي")).toBe(true);
    expect(matchesStory(yunus, "عاد")).toBe(false);
    expect(
      matchesStory(
        seed.stories.find((s) => s.slug === "ibrahim")!,
        "ابراهيم",
      ),
    ).toBe(true);
    expect(matchesStory(yunus, "  ")).toBe(true);
  });

  it("المقطع الطويل يُختصر والسورة تُعرف بالرقم أو بالاسم", () => {
    const yusuf = storyAyahRefs(seed.stories.find((s) => s.slug === "yusuf")!);
    expect(yusuf[0].shown).toEqual({ surah: 12, name: "يوسف", from: 1, to: MAX_SHOWN_AYAT });
    expect(yusuf[0].full.to).toBe(111);
    const byName = storyAyahRefs({ ayat: [{ surah: "سورة طه", from: 9, to: 10 }] });
    expect(byName[0].shown?.surah).toBe(20);
    const bad = storyAyahRefs({ ayat: [{ surah: "طه", from: 9, to: 500 }] });
    expect(bad[0].shown).toBeNull();
  });

  it("المصادر: المسجّلة أولاً ثم رابط Quran.com لكل مقطع بلا تكرار", () => {
    const src = storySources(yunus, (k, v) => `${k}:${v.surah}`);
    expect(src[0]).toEqual(yunus.sources![0]);
    expect(src.map((s) => s.url)).toContain("https://quran.com/37/139-148");
    expect(new Set(src.map((s) => s.url)).size).toBe(src.length);
  });
});
