/**
 * خطوات «أول يوم لك» للمعلّم (1.19.0). منطق صرف من سياق الرئيسية (my_home_context.setup) يُختبر وحده.
 */
import type { HomeContext } from "@/lib/home";

export const FIRST_DAY_DISMISSED_KEY = "zen-first-day-dismissed";

export type FirstDayKey = "halaqa" | "students" | "record" | "guardian";
export type FirstDayStep = { key: FirstDayKey; done: boolean; to: string };

export function firstDaySteps(ctx: HomeContext): FirstDayStep[] {
  const s = ctx.setup;
  return [
    { key: "halaqa", done: ctx.halaqas_taught > 0, to: "/centers" },
    { key: "students", done: (s?.students ?? 0) > 0, to: "/teacher/import" },
    { key: "record", done: !!s?.records, to: "/teacher/register" },
    { key: "guardian", done: !!s?.guardians, to: "/quran/students" },
  ];
}
