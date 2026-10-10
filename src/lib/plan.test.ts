import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/rpc", () => ({ rpc: vi.fn() }));

import {
  buildPlanDraft,
  planDayFor,
  planError,
  reviewPriority,
  ruleRationale,
  splitRange,
} from "./plan";
import type { ReviewCard } from "./zen-lms";

const card = (over: Partial<ReviewCard>): ReviewCard => ({
  id: Math.random().toString(),
  student_id: "s",
  surah_name: "الملك",
  from_ayah: 1,
  to_ayah: 5,
  ease: 2.5,
  interval_days: 1,
  repetitions: 1,
  lapses: 0,
  last_score: null,
  last_reviewed_at: null,
  due_date: "2026-10-05",
  ...over,
});

describe("خطة الحفظ", () => {
  it("splitRange يوزّع المقطع بأقسام متقاربة", () => {
    expect(splitRange(1, 10, 3)).toEqual([
      [1, 4],
      [5, 7],
      [8, 10],
    ]);
    expect(splitRange(3, 4, 5)).toEqual([
      [3, 3],
      [4, 4],
    ]);
  });

  it("الأولوية: الأقدم استحقاقاً ثم الأكثر تعثّراً ثم الأصعب", () => {
    const a = card({ surah_name: "أ", due_date: "2026-10-03", lapses: 0 });
    const b = card({ surah_name: "ب", due_date: "2026-10-03", lapses: 3 });
    const c = card({ surah_name: "ج", due_date: "2026-10-01" });
    expect(reviewPriority([a, b, c]).map((x) => x.surah_name)).toEqual(["ج", "ب", "أ"]);
  });

  it("المتأخر في اليوم الأول، والحدّ اليومي يدفع الزائد لليوم التالي، وما بعد الأسبوع لا يدخل", () => {
    const today = "2026-10-05";
    const cards = [
      card({ surah_name: "الملك", due_date: "2026-10-01" }),
      card({ surah_name: "القلم", due_date: "2026-10-02" }),
      card({ surah_name: "الحاقة", due_date: "2026-10-04" }),
      card({ surah_name: "نوح", due_date: "2026-10-08" }),
      card({ surah_name: "الجن", due_date: "2026-10-20" }),
    ];
    const items = buildPlanDraft(cards, { today, reviewsPerDay: 2 });
    const byName = Object.fromEntries(items.map((i) => [i.surah_name, i.day]));
    expect(byName).toEqual({ الملك: 1, القلم: 1, الحاقة: 2, نوح: 4 });
    expect(items.every((i) => i.kind === "review")).toBe(true);
  });

  it("الحفظ الجديد يُقسم على الأيام ثم يوم تثبيت، ويُقصّ على عدد آيات السورة", () => {
    const items = buildPlanDraft([], {
      today: "2026-10-05",
      newPortion: { surah_name: "سورة الملك", from_ayah: 1, to_ayah: 99 },
      newDays: 5,
    });
    const news = items.filter((i) => i.kind === "new");
    expect(news).toHaveLength(5);
    expect(news[0]).toMatchObject({ day: 1, surah_name: "الملك", from_ayah: 1, to_ayah: 6 });
    expect(news[4].to_ayah).toBe(30);
    expect(items.find((i) => i.kind === "review")).toMatchObject({
      day: 6,
      from_ayah: 1,
      to_ayah: 30,
    });
  });

  it("سورة غير معروفة تُتجاهل", () => {
    expect(
      buildPlanDraft([], {
        today: "2026-10-05",
        newPortion: { surah_name: "xx", from_ayah: 1, to_ayah: 3 },
      }),
    ).toEqual([]);
  });

  it("التعليل الآلي يذكر المتأخر والمتعثّر", () => {
    const cards = [card({ due_date: "2026-10-01", lapses: 2 })];
    const items = buildPlanDraft(cards, { today: "2026-10-05" });
    const t = ruleRationale(cards, items, "2026-10-05");
    expect(t).toContain("فات موعد");
    expect(t).toContain("تعثّر");
  });

  it("planDayFor ورسائل الأخطاء", () => {
    expect(planDayFor({ week_start: "2026-10-05" }, "2026-10-05")).toBe(1);
    expect(planDayFor({ week_start: "2026-10-05" }, "2026-10-11")).toBe(7);
    expect(planDayFor({ week_start: "2026-10-05" }, "2026-10-12")).toBeNull();
    expect(planError("ERROR: INVALID_PLAN")).toBe("في الخطة نطاق غير صالح.");
    expect(planError("boom")).toBe("تعذّرت العملية.");
  });
});
