import { beforeEach, describe, expect, it, vi } from "vitest";
import mushafAr from "@/locales/mushaf/ar.json";
import { SURAH_META } from "@/lib/quran/metadata";
import { PAGE_STARTS, SAJDAH_AYAHS } from "@/lib/quran/structure-data";
import {
  ayahAtOrdinal,
  ayahOrdinal,
  ayahsOnPage,
  hizbOfPage,
  isSajdah,
  juzOfPage,
  markerAtAyah,
  markersOnPage,
  pageOf,
  surahEndsPage,
} from "@/lib/quran/page-math";
import { juzOfPage as juz15, hizbOfPage as hizb15 } from "@/lib/mushaf15";
import { hizbForPage } from "@/lib/quran/page-service";
import { pageOfAyah } from "@/lib/quran/reading-tracker";
import { parseAyahRef, searchSurahNames } from "@/lib/quran/search-service";
import { formatRelativeArabic } from "@/lib/quran/reader-state";
import { inRange, nextTrack, normalizeRange, sleepStopsBefore } from "@/lib/quran/recitation-queue";

/* إصلاحات تقرير فحص المصحف: H1 وM1 وM2 وM7 وM8 وL2 وH3 والمؤقّت. */

describe("H1 — نهاية السورة ونهاية الصفحة", () => {
  it("تنتهي الصفحة مع السورة فقط إن لم تبدأ التالية فيها — للسور الـ١١٤ كلها", () => {
    let shared = 0;
    for (const s of SURAH_META) {
      const lastPage = pageOf(s.id, s.ayatCount);
      const expected = s.id === 114 || pageOf(s.id + 1, 1) !== lastPage;
      expect(surahEndsPage(s.id), `سورة ${s.id}`).toBe(expected);
      if (!expected) shared++;
    }
    // ٥٨ سورة تشارك صفحتها الأخيرة مع السورة التالية (كان الشرط القديم يخطئ فيها).
    expect(shared).toBe(58);
  });

  it("أمثلة التقرير", () => {
    for (const id of [4, 10, 17, 112, 113]) expect(surahEndsPage(id)).toBe(false);
    for (const id of [1, 2, 3, 114]) expect(surahEndsPage(id)).toBe(true);
  });
});

describe("M2 — قاعدة واحدة للجزء والحزب في الصفحة", () => {
  it("الصفحة ٦٢: الجزء ٤ والحزب ٧ (لا الجزء ٣ مع الحزب ٧)", () => {
    expect(juzOfPage(62)).toBe(4);
    expect(hizbOfPage(62)).toBe(7);
  });

  it("الوحدتان والخدمة متطابقة، والحزب داخل جزئه في كل الصفحات", () => {
    for (let p = 1; p <= 604; p++) {
      expect(juz15(p)).toBe(juzOfPage(p));
      expect(hizb15(p)).toBe(hizbOfPage(p));
      expect(hizbForPage(p)).toBe(hizbOfPage(p));
      expect(Math.ceil(hizbOfPage(p) / 2), `الصفحة ${p}`).toBe(juzOfPage(p));
    }
  });

  it("pageOf يطابق بدايات الصفحات ودالة القارئ", () => {
    PAGE_STARTS.forEach(([s, a], i) => expect(pageOf(s, a)).toBe(i + 1));
    for (const [s, a] of [
      [2, 255],
      [18, 1],
      [36, 83],
      [114, 6],
    ] as const) {
      expect(pageOf(s, a)).toBe(pageOfAyah(s, a));
    }
  });
});

describe("M1 — عدد الآيات من الصفحات المقروءة", () => {
  it("مجموع آيات الصفحات ٦٢٣٦، والترتيب يُعكس", () => {
    let n = 0;
    for (let p = 1; p <= 604; p++) n += ayahsOnPage(p);
    expect(n).toBe(6236);
    expect(ayahsOnPage(1)).toBe(7);
    expect(ayahAtOrdinal(ayahOrdinal(2, 255))).toEqual({ surah: 2, ayah: 255 });
  });
});

describe("M1 — السجل اليومي لا يُحسب من تغيّر الموضع", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const target = new EventTarget();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    });
    vi.resetModules();
  });

  it("القفز من الفاتحة إلى آخر البقرة لا يضيف آيات؛ قراءة صفحة تضيف آياتها", async () => {
    const { recordRead, markPagesRead } = await import("@/lib/quran/reading-history");
    const { readQuranActivity } = await import("@/lib/quran/activity");
    recordRead({ surah: 1, ayah: 1, page: 1, juz: 1, mode: "surah" });
    recordRead({ surah: 2, ayah: 150, page: 23, juz: 2, mode: "surah" });
    expect(Object.values(readQuranActivity()).reduce((a, b) => a + b, 0)).toBe(0);
    markPagesRead([1]);
    expect(Object.values(readQuranActivity()).reduce((a, b) => a + b, 0)).toBe(7);
  });
});

describe("M8 — علامات الهامش", () => {
  it("٢٤٠ علامة ربع/حزب/جزء و١٥ سجدة", () => {
    let starts = 0;
    let sajdahs = 0;
    for (let p = 1; p <= 604; p++) {
      for (const m of markersOnPage(p)) {
        if (m.kind === "sajdah") sajdahs++;
        else starts++;
      }
    }
    expect(starts).toBe(240);
    expect(sajdahs).toBe(SAJDAH_AYAHS.length);
  });

  it("بداية الجزء ٤ في الصفحة ٦٢ وسجدة الأعراف", () => {
    expect(markerAtAyah(3, 93)).toMatchObject({ kind: "juz", no: 4 });
    expect(markersOnPage(62).some((m) => m.kind === "juz" && m.no === 4)).toBe(true);
    expect(isSajdah(7, 206)).toBe(true);
    expect(isSajdah(7, 205)).toBe(false);
  });
});

describe("M7 — البحث بالمرجع والأسماء المشهورة", () => {
  it.each([
    ["2:255", 2, 255],
    ["٢:٢٥٥", 2, 255],
    ["2/255", 2, 255],
    ["البقرة 255", 2, 255],
    ["سورة البقرة آية 255", 2, 255],
    ["آية الكرسي", 2, 255],
    ["تبارك 3", 67, 3],
  ])("%s", (q, surah, ayah) => {
    expect(parseAyahRef(q)).toMatchObject({ surah, ayah });
  });

  it("يرفض المراجع غير الصحيحة", () => {
    for (const q of ["2:300", "115:1", "الرحمن", "0:1"]) expect(parseAyahRef(q)).toBeNull();
  });

  it("الأسماء المشهورة: تبارك وعمّ وبني إسرائيل وبراءة", () => {
    expect(searchSurahNames("تبارك")[0].id).toBe(67);
    expect(searchSurahNames("عم")[0].id).toBe(78);
    expect(searchSurahNames("بني إسرائيل")[0].id).toBe(17);
    expect(searchSurahNames("براءة")[0].id).toBe(9);
    expect(searchSurahNames("البقره")[0].id).toBe(2);
  });
});

describe("L2 — الوقت النسبي بصيغة العدد العربية", () => {
  const now = 1_700_000_000_000;
  const ago = (min: number) => formatRelativeArabic(now - min * 60_000, now);
  it.each([
    [1, "قبل دقيقة"],
    [2, "قبل دقيقتين"],
    [3, "قبل ٣ دقائق"],
    [11, "قبل ١١ دقيقة"],
    [120, "قبل ساعتين"],
    [300, "قبل ٥ ساعات"],
    [1440, "أمس"],
    [2880, "قبل يومين"],
    [7200, "قبل ٥ أيام"],
    [20160, "قبل ١٤ يوماً"],
  ])("%i دقيقة", (min, text) => expect(ago(min)).toBe(text));
});

describe("H3/L11 — المقطع المكرَّر عبر السور وتكرار الآية", () => {
  const base = { continuous: true, loopsDone: 0 };

  it("يرتّب الطرفين ويقيّدهما", () => {
    expect(normalizeRange({ surah: 2, from: 9, to: 3, times: 2 })).toMatchObject({
      surah: 2,
      from: 3,
      to: 9,
    });
    expect(normalizeRange({ surah: 2, from: 5, to: 999, times: 1 }).to).toBe(286);
  });

  it("يمتد من آخر الملك إلى أول القلم ثم يعود إلى بدايته", () => {
    const range = normalizeRange({ surah: 67, from: 29, to: 2, toSurah: 68, times: 2 });
    expect(inRange({ surah: 68, ayah: 1 }, range)).toBe(true);
    expect(nextTrack({ surah: 67, ayah: 30 }, { ...base, range })).toEqual({ surah: 68, ayah: 1 });
    expect(nextTrack({ surah: 68, ayah: 2 }, { ...base, range })).toEqual({ surah: 67, ayah: 29 });
    expect(nextTrack({ surah: 68, ayah: 2 }, { ...base, range, loopsDone: 1 })).toBeNull();
  });

  it("مؤقّت النوم: نهاية السورة أو انقضاء الدقائق", () => {
    const cur = { surah: 1, ayah: 7 };
    expect(sleepStopsBefore({ kind: "surah" }, cur, { surah: 2, ayah: 1 })).toBe(true);
    expect(sleepStopsBefore({ kind: "surah" }, { surah: 2, ayah: 1 }, { surah: 2, ayah: 2 })).toBe(
      false,
    );
    expect(sleepStopsBefore({ kind: "minutes", minutes: 5, until: 100 }, cur, null, 99)).toBe(
      false,
    );
    expect(sleepStopsBefore({ kind: "minutes", minutes: 5, until: 100 }, cur, null, 100)).toBe(
      true,
    );
    expect(sleepStopsBefore(null, cur, null)).toBe(false);
  });
});

describe("قاموس القارئ", () => {
  const flat = (o: unknown, p = ""): [string, string][] =>
    typeof o === "string"
      ? [[p, o]]
      : Object.entries(o as object).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k));
  const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
  it("بلا نص فارغ", () => {
    for (const [k, v] of new Map(flat(mushafAr))) expect(v.trim(), k).not.toBe("");
  });
});
