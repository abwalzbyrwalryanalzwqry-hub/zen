import { describe, expect, it } from "vitest";
import {
  MUSHAF_PAGES,
  completeToday,
  createPlan,
  daysBetween,
  endKey,
  normalizeStore,
  notePageTurn,
  pageSpot,
  planStatus,
  rebalance,
  scheduledThrough,
  setReached,
} from "@/lib/quran/khatmah-plan";

const START = "2026-09-23";

describe("التوزيع", () => {
  it("ختمة شهر من الفاتحة: ٢٠-٢١ صفحة يومياً وتنتهي بالصفحة ٦٠٤", () => {
    const plan = createPlan(30, START);
    let prev = 0;
    for (let i = 0; i < 30; i += 1) {
      const t = scheduledThrough(plan, i);
      expect(t - prev).toBeGreaterThanOrEqual(20);
      expect(t - prev).toBeLessThanOrEqual(21);
      prev = t;
    }
    expect(prev).toBe(MUSHAF_PAGES);
    expect(endKey(plan)).toBe("2026-10-22");
  });

  it("كل المدد تغطي المصحف كاملاً بلا أيام فارغة", () => {
    for (const days of [1, 3, 7, 10, 15, 29, 60, 365]) {
      for (const startPage of [1, 300, 600]) {
        const plan = createPlan(days, START, startPage);
        expect(scheduledThrough(plan, days - 1)).toBe(MUSHAF_PAGES);
        let prev = startPage - 1;
        for (let i = 0; i < days; i += 1) {
          const t = scheduledThrough(plan, i);
          expect(t).toBeGreaterThanOrEqual(prev);
          prev = t;
        }
      }
    }
  });

  it("المدد والصفحات خارج النطاق تُحصر", () => {
    expect(createPlan(0, START).days).toBe(30);
    expect(createPlan(9999, START).days).toBe(365);
    expect(createPlan(7, START, 9999).startPage).toBe(MUSHAF_PAGES);
  });
});

describe("حالة اليوم", () => {
  it("اليوم الأول: الورد من ١ إلى ٢١", () => {
    const s = planStatus(createPlan(30, START), START);
    expect(s.phase).toBe("active");
    expect(s.day).toBe(1);
    expect(s.portion?.from.page).toBe(1);
    expect(s.portion?.to.page).toBe(21);
    expect(s.portion?.from.surahName).toContain("الفاتحة");
    expect(s.daysLeft).toBe(29);
  });

  it("إتمام الورد يثبّت هدف اليوم", () => {
    const plan = completeToday(createPlan(30, START), START);
    expect(plan.reached).toBe(21);
    const s = planStatus(plan, START);
    expect(s.todayDone).toBe(true);
    expect(s.portion).toBeNull();
  });

  it("التأخّر يُضاف إلى ورد اليوم", () => {
    const plan = createPlan(30, START); // لم يقرأ شيئاً
    const s = planStatus(plan, "2026-09-25"); // اليوم الثالث
    expect(s.behind).toBe(scheduledThrough(plan, 1));
    expect(s.portion?.from.page).toBe(1);
    expect(s.portion?.to.page).toBe(scheduledThrough(plan, 2));
  });

  it("التقدّم عن الجدول", () => {
    const plan = setReached(createPlan(30, START), 100);
    const s = planStatus(plan, START);
    expect(s.ahead).toBe(100 - 21);
    expect(s.todayDone).toBe(true);
  });

  it("قبل البداية وبعد انتهاء المدة", () => {
    const plan = createPlan(7, "2026-10-01");
    expect(planStatus(plan, START).phase).toBe("upcoming");
    const late = planStatus(setReached(plan, 500), "2026-10-20");
    expect(late.phase).toBe("overdue");
    expect(late.portion?.to.page).toBe(MUSHAF_PAGES);
  });

  it("الاكتمال", () => {
    const s = planStatus(setReached(createPlan(7, START), MUSHAF_PAGES), START);
    expect(s.phase).toBe("finished");
    expect(s.progress).toBe(1);
  });
});

describe("تقليب الصفحات", () => {
  const plan = setReached(createPlan(30, START), 10);
  it("من الصفحة التالية إلى ما بعدها = قراءة", () => {
    expect(notePageTurn(plan, 11, 12).reached).toBe(11);
  });
  it("القفزات والرجوع تُتجاهل", () => {
    expect(notePageTurn(plan, 11, 50)).toBe(plan);
    expect(notePageTurn(plan, 12, 11)).toBe(plan);
    expect(notePageTurn(plan, 200, 201)).toBe(plan);
  });
});

describe("إعادة التوزيع", () => {
  it("تبدأ من الموضع الحالي وتحافظ على التاريخ الختامي", () => {
    const plan = setReached(createPlan(30, START), 50);
    const next = rebalance(plan, "2026-10-03");
    expect(next.startPage).toBe(51);
    expect(next.reached).toBe(50);
    expect(endKey(next)).toBe(endKey(plan));
    expect(scheduledThrough(next, next.days - 1)).toBe(MUSHAF_PAGES);
  });
});

describe("أدوات", () => {
  it("فرق الأيام يعبر حدود الأشهر", () => {
    expect(daysBetween("2026-09-30", "2026-10-01")).toBe(1);
    expect(daysBetween("2026-10-01", "2026-09-30")).toBe(-1);
  });
  it("موضع الصفحة", () => {
    expect(pageSpot(1)).toMatchObject({ surah: 1, juz: 1 });
    expect(pageSpot(2)).toMatchObject({ surah: 2, juz: 1 });
    expect(pageSpot(22).juz).toBe(2);
    expect(pageSpot(604)).toMatchObject({ surah: 112, juz: 30 });
    expect(pageSpot(604, "end").surah).toBe(114);
  });
  it("مخزن تالف يعود فارغاً", () => {
    expect(normalizeStore("x")).toEqual({ plan: null, completed: [] });
    expect(normalizeStore({ plan: { startKey: "bad" } }).plan).toBeNull();
  });
});
