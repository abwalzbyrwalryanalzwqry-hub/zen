/**
 * الترحيب المبسّط (3.11): شاشة واحدة يختار فيها المستخدم دوره (طالب، ولي أمر، معلّم) أو يجرّب دون
 * حساب. الدور يُحفظ على الجهاز حتى أول دخول: يفتح صفحة الدخول على «حساب جديد»، ثم يُطبَّق تلقائياً
 * على بطاقة «كيف ستستخدم زِن؟» (الطالب وولي الأمر)، أو يفتح تفعيل المعلّم مباشرة.
 */
export type OnboardRole = "student" | "guardian" | "teacher";
export const ONBOARDED_KEY = "zen-onboarded";
export const ONBOARD_ROLE_KEY = "zen-onboard-role";

const isRole = (v: unknown): v is OnboardRole =>
  v === "student" || v === "guardian" || v === "teacher";

function ls(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function finishOnboarding(role: OnboardRole | null): void {
  const s = ls();
  if (!s) return;
  s.setItem(ONBOARDED_KEY, "1");
  if (role) s.setItem(ONBOARD_ROLE_KEY, role);
  else s.removeItem(ONBOARD_ROLE_KEY);
}

export function onboardRole(): OnboardRole | null {
  const v = ls()?.getItem(ONBOARD_ROLE_KEY);
  return isRole(v) ? v : null;
}

/** يُستهلك مرة واحدة بعد تطبيقه. */
export function clearOnboardRole(): void {
  ls()?.removeItem(ONBOARD_ROLE_KEY);
}

/** صفحة الدخول تبدأ بـ«حساب جديد» لمن اختار دوره للتو. */
export const prefersSignup = () => onboardRole() !== null;
