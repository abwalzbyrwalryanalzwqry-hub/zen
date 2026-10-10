// ألوان تقرير الاختبارات للمعلّم (M5: من TeacherExamReport.tsx).

import { type MasteryLevel } from "@/lib/exam/types";

/** ألوان المستويات — نفسها في سجل اختبارات الطالب. */
export const MASTERY_TEXT: Record<MasteryLevel, string> = {
  mastery: "text-emerald-400",
  proficient: "text-primary",
  good: "text-gold",
  needs_review: "text-orange-400",
  weak: "text-destructive",
};

export const MASTERY_BG: Record<MasteryLevel, string> = {
  mastery: "bg-emerald-400",
  proficient: "bg-primary",
  good: "bg-gold",
  needs_review: "bg-orange-400",
  weak: "bg-destructive",
};

export function percentColor(p: number): string {
  if (p >= 90) return "text-emerald-400";
  if (p >= 75) return "text-primary";
  if (p >= 60) return "text-gold";
  return "text-destructive";
}

export function barColor(p: number): string {
  if (p >= 90) return "bg-emerald-400";
  if (p >= 75) return "bg-primary";
  if (p >= 60) return "bg-gold";
  return "bg-destructive";
}
