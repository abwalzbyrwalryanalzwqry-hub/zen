import { describe, expect, it } from "vitest";
import { firstDates, forecastKhatm, humanDuration } from "./forecast";

const days = (start: string, n: number, perDay = 1) => {
  const out: string[] = [];
  const t = Date.parse(`${start}T00:00:00Z`);
  for (let i = 0; i < n; i++)
    for (let k = 0; k < perDay; k++)
      out.push(new Date(t + i * 86_400_000).toISOString().slice(0, 10));
  return out;
};

describe("توقّع الختم (8.5)", () => {
  it("صفحة يومياً منذ 60 يوماً: 544 يوماً متبقية، و+1 يختصرها إلى النصف", () => {
    const f = forecastKhatm(days("2026-08-01", 60), "2026-09-29");
    expect(f.status).toBe("ok");
    if (f.status !== "ok") return;
    expect(f.memorized).toBe(60);
    expect(f.rate).toBe(1);
    expect(f.days).toBe(544);
    expect(f.plusOne).toMatchObject({ rate: 2, days: 272, savedDays: 272 });
    expect(f.date).toBe("2028-03-26");
  });

  it("النافذة 60 يوماً فقط: الحفظ القديم يُحسب في المجموع لا في المعدّل", () => {
    const old = days("2025-01-01", 100, 2); // 200 صفحة قديمة
    const recent = days("2026-09-20", 10); // 10 صفحات في آخر 10 أيام من 60
    const f = forecastKhatm([...old, ...recent], "2026-09-29");
    if (f.status !== "ok") throw new Error(f.status);
    expect(f.memorized).toBe(210);
    expect(f.rate).toBeCloseTo(10 / 60, 2);
  });

  it("حافظ جديد: النافذة تبدأ من أول صفحة", () => {
    const f = forecastKhatm(days("2026-09-20", 10, 2), "2026-09-29");
    if (f.status !== "ok") throw new Error(f.status);
    expect(f.rate).toBe(2);
    expect(f.days).toBe(292);
  });

  it("حالات: لا بيانات، متوقف، ختم", () => {
    expect(forecastKhatm([], "2026-09-29").status).toBe("no-data");
    const s = forecastKhatm(days("2026-01-01", 5), "2026-09-29");
    expect(s).toMatchObject({ status: "stalled", lastDay: "2026-01-05" });
    expect(forecastKhatm(days("2025-01-01", 604), "2026-09-29").status).toBe("done");
  });

  it("أول تاريخ لكل صفحة", () => {
    expect(
      firstDates([
        { page: 1, session_date: "2026-09-02" },
        { page: 1, session_date: "2026-09-01" },
        { page: 2, session_date: "2026-09-03" },
      ]).sort(),
    ).toEqual(["2026-09-01", "2026-09-03"]);
  });

  it("صيغة المدّة", () => {
    expect(humanDuration(30)).toBe("30 يوماً");
    expect(humanDuration(272)).toBe("9 أشهر تقريباً");
    expect(humanDuration(400)).toBe("13 شهراً تقريباً");
    expect(humanDuration(1000)).toBe("2.7 سنة تقريباً");
  });
});
