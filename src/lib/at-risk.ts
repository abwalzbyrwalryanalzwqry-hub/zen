/**
 * الإنذار المبكر (9.4): `at_risk_students` يعيد من تحقّق فيه سبب أو أكثر، وهنا نصوص الأسباب
 * ورسالة وليّ الأمر وخطة المراجعة المقترحة (نصوص يراجعها المعلّم قبل الإرسال، لا إرسال تلقائي).
 */
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export type RiskReason = "absences" | "low_grade" | "overdue" | "inactive";
export interface AtRiskStudent {
  student_id: string;
  name: string;
  halaqa_id: string;
  halaqa_name: string;
  reasons: RiskReason[];
  absences: number;
  avg_score: number | null;
  overdue: number;
  inactive_days: number | null;
  has_guardian: boolean;
}

export async function fetchAtRisk(halaqa: string | null = null): Promise<AtRiskStudent[]> {
  const { data, error } = await supabase.rpc("at_risk_students", { _halaqa: halaqa ?? undefined });
  if (error) throw error;
  return (data as unknown as AtRiskStudent[]) ?? [];
}

export function reasonLabel(reason: RiskReason, s: AtRiskStudent): string {
  switch (reason) {
    case "absences":
      return `غاب ${s.absences} مرات متتالية`;
    case "low_grade":
      return `متوسط آخر تقييماته ${s.avg_score ?? 0}٪`;
    case "overdue":
      return `${s.overdue} مقطعاً متأخراً في المراجعة`;
    case "inactive":
      return s.inactive_days == null ? "لا نشاط مسجّل بعد" : `بلا نشاط منذ ${s.inactive_days} أيام`;
  }
}

/** خطة مراجعة مقترحة: المتأخر يُوزَّع على أسبوعين، بحد 10 مقاطع يومياً ولا أقل من 3. */
export function reviewPlan(
  s: AtRiskStudent,
): { perDay: number; days: number; text: string } | null {
  if (s.overdue <= 0) return null;
  const perDay = Math.min(10, Math.max(3, Math.ceil(s.overdue / 14)));
  const days = Math.ceil(s.overdue / perDay);
  return {
    perDay,
    days,
    text: `مراجعة ${perDay} مقاطع يومياً من «طابور اليوم» لمدة ${days} يوماً، بالأقدم أولاً، مع تسميع أسبوعي في الحلقة.`,
  };
}

/** رسالة وليّ الأمر: لطيفة وعامة، بلا درجات دقيقة ولا مقارنة بزملائه. */
export function guardianMessage(s: AtRiskStudent): string {
  const lines = [`السلام عليكم ورحمة الله،`, `نودّ متابعة ${s.name} في ${s.halaqa_name} معكم:`];
  if (s.reasons.includes("absences")) lines.push(`- تغيّب عن الحلقة ${s.absences} مرات متتالية.`);
  if (s.reasons.includes("inactive")) lines.push("- لم يسجّل تسميعاً أو مراجعة منذ أيام.");
  if (s.reasons.includes("low_grade"))
    lines.push("- يحتاج إلى تثبيت الحفظ الأخير قبل الانتقال لجديد.");
  const plan = reviewPlan(s);
  if (plan) lines.push(`- اقترحنا له: ${plan.text}`);
  lines.push("نرجو تشجيعه ومتابعته في البيت، وجزاكم الله خيراً.");
  return lines.join("\n");
}

export async function shareText(text: string): Promise<"shared" | "copied" | "cancelled"> {
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import("@capacitor/share");
    try {
      await Share.share({ title: "زِن", text, dialogTitle: "رسالة لوليّ الأمر" });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}
