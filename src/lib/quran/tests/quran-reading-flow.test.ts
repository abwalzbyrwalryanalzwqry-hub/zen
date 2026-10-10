import { describe, expect, it } from "vitest";
import { createPlan, notePageRead, notePageTurn, setReached } from "@/lib/quran/khatmah-plan";
import { JUZ_META } from "@/lib/quran/juz-metadata";
import { PAGE_STARTS } from "@/lib/quran/structure-data";
import { juzOf, pageStart, PageDwellTracker } from "@/lib/quran/reading-tracker";

/* المرحلة ٣: متى تُعدّ الصفحة مقروءة، وأين يقف القارئ. */

const DWELL = 10_000;

describe("تتبع الصفحات المقروءة", () => {
  it("الانتقال إلى الصفحة التالية بعد مكوث كافٍ يحتسب الصفحة السابقة", () => {
    const t = new PageDwellTracker(DWELL);
    expect(t.visit(10, 0)).toEqual([]);
    expect(t.visit(11, DWELL)).toEqual([10]);
    expect(t.visit(12, DWELL * 2 + 1)).toEqual([11]);
  });

  it("التقليب السريع تصفّح لا قراءة", () => {
    const t = new PageDwellTracker(DWELL);
    t.visit(10, 0);
    expect(t.visit(11, 2_000)).toEqual([]);
    expect(t.visit(12, 4_000)).toEqual([]);
  });

  it("القفز والرجوع للخلف لا يُحتسبان، ولا تُحتسب الصفحة مرتين", () => {
    const t = new PageDwellTracker(DWELL);
    t.visit(10, 0);
    expect(t.visit(50, DWELL)).toEqual([]);
    expect(t.visit(49, DWELL * 2)).toEqual([]);
    expect(t.visit(50, DWELL * 3)).toEqual([49]);
    t.visit(49, DWELL * 4);
    expect(t.visit(50, DWELL * 5)).toEqual([]);
  });

  it("إنهاء الصفحة الأخيرة (٦٠٤) بالمكوث عليها", () => {
    const t = new PageDwellTracker(DWELL);
    t.visit(603, 0);
    expect(t.visit(604, DWELL)).toEqual([603]);
    expect(t.finish(DWELL + 1_000)).toEqual([]);
    expect(t.finish(DWELL * 2)).toEqual([604]);
    expect(t.finish(DWELL * 3)).toEqual([]);
  });
});

describe("مواضع المصحف", () => {
  it("بداية الصفحة من بيانات المصحف", () => {
    expect(pageStart(1)).toEqual({ surah: 1, ayah: 1 });
    expect(pageStart(2)).toEqual({ surah: 2, ayah: 1 });
    expect(pageStart(604)).toEqual({ surah: 112, ayah: 1 });
    expect(pageStart(9999)).toEqual({ surah: PAGE_STARTS[603][0], ayah: PAGE_STARTS[603][1] });
  });

  it("الجزء الذي تقع فيه الآية", () => {
    expect(juzOf(1, 1)).toBe(1);
    expect(juzOf(2, 141)).toBe(1);
    expect(juzOf(2, 142)).toBe(2);
    expect(juzOf(114, 6)).toBe(30);
    for (const j of JUZ_META) expect(juzOf(j.start.surah, j.start.ayah)).toBe(j.id);
  });
});

describe("الختمة", () => {
  const START = "2026-09-23";

  it("تتقدّم بالصفحة التالية لموضعها فقط", () => {
    const plan = setReached(createPlan(30, START), 10);
    expect(notePageRead(plan, 11).reached).toBe(11);
    expect(notePageRead(plan, 12)).toBe(plan);
    expect(notePageRead(plan, 10)).toBe(plan);
  });

  it("تكتمل عند الصفحة ٦٠٤ دون حاجة إلى صفحة بعدها", () => {
    const plan = setReached(createPlan(30, START), 603);
    expect(notePageRead(plan, 604).reached).toBe(604);
  });

  it("التقليب إلى التالية ما زال يعمل كما كان", () => {
    const plan = setReached(createPlan(30, START), 10);
    expect(notePageTurn(plan, 11, 12).reached).toBe(11);
    expect(notePageTurn(plan, 11, 50)).toBe(plan);
  });
});
