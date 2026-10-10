/**
 * الأهداف العائلية (11.3): يضعها وليّ الأمر لابنه بمكافأة رمزية، ويقرؤها الابن. التقدّم من الخادم
 * (سجل الطالب منذ بدء الهدف). لا مقارنة بين الأبناء: كل طلب لطالب واحد.
 */
import { supabase } from "@/integrations/supabase/client";

export type GoalKind = "pages" | "juz" | "active_days" | "attendance" | "streak";

export type FamilyGoal = {
  id: string;
  kind: GoalKind;
  target: number;
  progress: number;
  title: string | null;
  reward: string | null;
  starts_on: string;
  ends_on: string | null;
  status: "active" | "done";
  achieved_at: string | null;
  expired: boolean;
  mine: boolean;
};

export const GOAL_KINDS: { kind: GoalKind; label: string; unit: string; max: number }[] = [
  { kind: "pages", label: "حفظ صفحات", unit: "صفحة", max: 604 },
  { kind: "juz", label: "إتمام أجزاء", unit: "جزء", max: 30 },
  { kind: "active_days", label: "أيام نشاط", unit: "يوم", max: 366 },
  { kind: "attendance", label: "حضور الحلقة", unit: "حصة", max: 366 },
  { kind: "streak", label: "سلسلة أيام متتالية", unit: "يوماً", max: 366 },
];

export const goalKind = (k: GoalKind) => GOAL_KINDS.find((g) => g.kind === k) ?? GOAL_KINDS[0];

/** نص الهدف إن لم يكتب وليّ الأمر عنواناً. */
export const goalTitle = (g: Pick<FamilyGoal, "kind" | "target" | "title">) =>
  g.title?.trim() || `${goalKind(g.kind).label}: ${g.target} ${goalKind(g.kind).unit}`;

export const goalPercent = (g: Pick<FamilyGoal, "progress" | "target">) =>
  g.target <= 0 ? 0 : Math.min(100, Math.round((g.progress / g.target) * 100));

export function goalErrorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (m.includes("TOO_MANY_GOALS")) return "لابنك ثلاثة أهداف نشطة. أتمّها أو ألغِ أحدها أولاً.";
  if (m.includes("INVALID_DATE")) return "تاريخ النهاية مضى.";
  if (m.includes("NOT_ALLOWED")) return "لا تملك وضع أهداف لهذا الطالب.";
  return "تعذّرت العملية. حاول مرة أخرى.";
}

export async function familyGoalsFor(studentId: string): Promise<FamilyGoal[]> {
  const { data, error } = await supabase.rpc("family_goals_for", { _student: studentId });
  if (error) throw new Error(error.message);
  return (data as unknown as FamilyGoal[]) ?? [];
}

export async function setFamilyGoal(input: {
  studentId: string;
  kind: GoalKind;
  target: number;
  title?: string;
  reward?: string;
  endsOn?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("set_family_goal", {
    _student: input.studentId,
    _kind: input.kind,
    _target: input.target,
    _title: input.title ?? undefined,
    _reward: input.reward ?? undefined,
    _ends_on: input.endsOn ?? undefined,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function cancelFamilyGoal(goalId: string) {
  const { error } = await supabase.rpc("cancel_family_goal", { _goal: goalId });
  if (error) throw new Error(error.message);
}
