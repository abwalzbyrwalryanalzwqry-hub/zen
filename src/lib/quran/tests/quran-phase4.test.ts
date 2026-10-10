import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { quranPageService } from "@/lib/quran/page-service";
import { needsBasmalaIntro } from "@/lib/quran/recitations";
import { searchSurahNames } from "@/lib/quran/search-service";
import { markPagesRead, readHistory, recordRead } from "@/lib/quran/reading-history";

/* المرحلة ٤: إصلاحات سريعة في قسم القرآن. */

const DATA = fileURLToPath(new URL("../../../../public/data/quran/uthmani/", import.meta.url));

const LAYOUT = fileURLToPath(new URL("../../../../public/data/quran/mushaf15/", import.meta.url));

function okResponse(id: number, dir = DATA) {
  const body = readFileSync(`${dir}${id}.json`, "utf8");
  return { ok: true, status: 200, json: async () => JSON.parse(body) } as unknown as Response;
}

describe("خدمة الصفحات: الفشل لا يُحفظ", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("تنجح إعادة المحاولة بعد فشل تحميل الصفحة", async () => {
    // الصفحة ٥٩٠ من سورة واحدة (التكوير/الانفطار) لم تُحمَّل في أي اختبار آخر.
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (fail) throw new TypeError("network down");
        const id = Number(/(\d+)\.json$/.exec(url)?.[1]);
        return okResponse(id, url.includes("/mushaf15/") ? LAYOUT : DATA);
      }),
    );

    await expect(quranPageService.loadPage(590)).rejects.toThrow();
    fail = false;
    const page = await quranPageService.loadPage(590);
    expect(page.page).toBe(590);
    expect(page.segments.length).toBeGreaterThan(0);
  });
});

describe("البسملة قبل التلاوة", () => {
  it("تُشغَّل قبل الآية الأولى فقط، عدا الفاتحة والتوبة", () => {
    expect(needsBasmalaIntro(2, 1)).toBe(true);
    expect(needsBasmalaIntro(114, 1)).toBe(true);
    expect(needsBasmalaIntro(2, 2)).toBe(false);
    expect(needsBasmalaIntro(1, 1)).toBe(false);
    expect(needsBasmalaIntro(9, 1)).toBe(false);
  });
});

describe("البحث عن السور", () => {
  it("مطبَّع ويقبل كلمة «سورة» قبل الاسم", () => {
    expect(searchSurahNames("الانعام").map((s) => s.id)).toEqual([6]);
    expect(searchSurahNames("سورة الانعام").map((s) => s.id)).toEqual([6]);
    expect(searchSurahNames("سورة البقرة").map((s) => s.id)).toEqual([2]);
    expect(searchSurahNames("٢").map((s) => s.id)).toEqual([2]);
  });
});

describe("جلسات القراءة وسلسلة الأيام", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      dispatchEvent: () => true,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  it("فتح المصحف وحده لا يُحتسب يوم قراءة", () => {
    recordRead({ surah: 2, ayah: 1, page: 2, juz: 1, mode: "surah" });
    expect(readHistory().days).toEqual({});
    expect(readHistory().entries).toHaveLength(1);
  });

  it("قراءة صفحة فعلاً تُحتسب جلسة، والصفحات المتتالية في الجلسة نفسها لا تكرّرها", () => {
    const now = Date.now();
    markPagesRead([2], now);
    markPagesRead([3], now + 60_000);
    expect(readHistory().days[today()]).toBe(1);
    expect(readHistory().pages).toEqual([2, 3]);
  });

  it("انقطاع طويل يبدأ جلسة جديدة، وإعادة قراءة صفحة سابقة تُحتسب", () => {
    const now = Date.now() - 2 * 60 * 60 * 1000;
    markPagesRead([2], now);
    markPagesRead([2], now + 45 * 60 * 1000);
    const total = Object.values(readHistory().days).reduce((a, b) => a + b, 0);
    expect(total).toBe(2);
    expect(readHistory().pages).toEqual([2]);
  });

  it("قائمة فارغة أو صفحات غير صالحة لا تُحتسب", () => {
    markPagesRead([]);
    markPagesRead([0, 999]);
    expect(readHistory().days).toEqual({});
  });
});
