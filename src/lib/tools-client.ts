/**
 * أدوات الذكاء المساعدة من العميل (المرحلة 6.3): دالة Edge «zen-tools» في الويب وAndroid.
 * الواجهة `{ data }` كما كانت دوال الخادم السابقة.
 */
import { EdgeCallError, callEdge } from "@/lib/server-call";
import { TEXT_AI_DECLINED, ensureTextAiConsent, getTextAiState } from "@/lib/text-ai-consent";
import type { PlanItem, WeekFacts } from "@/lib/tools-core";

export type { WeekFacts, PlanItem } from "@/lib/tools-core";

const opts = {
  offlineMessage: "المساعد يحتاج اتصالاً بالإنترنت.",
  fallbackMessage: "تعذّر الوصول إلى المساعد الآن.",
};

export function teacherWeeklySummary(input: { data: { student_id: string; days?: number } }) {
  return callEdge<{ facts: WeekFacts; text: string; ai: boolean }>(
    "zen-tools",
    { action: "weekly_summary", ...input.data },
    opts,
  );
}

/** تعليل الخطة إضافة: بلا موافقة نافذة لا نسأل ولا نرسل، ويبقى تعليل القواعد في الواجهة (N-03). */
export async function planRationale(input: {
  data: { items: PlanItem[]; stats: { cards: number; overdue: number; weak: number } };
}): Promise<{ text: string | null }> {
  const ok = await getTextAiState().then(
    (s) => s.effective,
    () => false,
  );
  if (!ok) return { text: null };
  return callEdge<{ text: string | null }>(
    "zen-tools",
    { action: "plan_rationale", ...input.data },
    opts,
  );
}

export async function muhasabaCoach(input: { data: { text: string } }) {
  if (!(await ensureTextAiConsent())) throw new EdgeCallError(TEXT_AI_DECLINED);
  return callEdge<{ text: string }>("zen-tools", { action: "muhasaba_coach", ...input.data }, opts);
}

export type TeacherDraft = { text: string; ai: boolean; draft: true };

/** مسودّة خطة الأسبوع القادم (12.3): يحرّرها المعلّم ولا تُطبَّق تلقائياً. */
export function draftWeekPlan(studentId: string) {
  return callEdge<TeacherDraft>(
    "zen-tools",
    { action: "draft_week_plan", student_id: studentId },
    opts,
  );
}

/** مسودّة رسالة لوليّ الأمر (12.3): لا تُرسل إلا بمشاركة المعلّم لها بنفسه. */
export function draftGuardianNote(studentId: string) {
  return callEdge<TeacherDraft>(
    "zen-tools",
    { action: "draft_guardian_note", student_id: studentId },
    opts,
  );
}
