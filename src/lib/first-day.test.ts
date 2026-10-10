import { describe, expect, it } from "vitest";
import { EMPTY_CONTEXT } from "@/lib/home";
import { firstDaySteps } from "./first-day";

describe("أول يوم للمعلّم", () => {
  it("لا شيء منجز لمعلّم جديد", () => {
    expect(firstDaySteps({ ...EMPTY_CONTEXT, is_teacher: true }).every((s) => !s.done)).toBe(true);
  });
  it("كل خطوة من حقلها في السياق", () => {
    const steps = firstDaySteps({
      ...EMPTY_CONTEXT,
      is_teacher: true,
      halaqas_taught: 1,
      setup: { students: 4, records: true, guardians: false },
    });
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ["halaqa", true],
      ["students", true],
      ["record", true],
      ["guardian", false],
    ]);
  });
});
