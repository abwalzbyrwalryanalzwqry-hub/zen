import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/integrations/supabase/rpc";

/**
 * الأدوار تُدار في جدول user_roles داخل قاعدة البيانات، ولا تُكتب من العميل.
 * دور المعلم يُمنح فقط برمز دعوة يُصدره معلّم قائم (دوال SECURITY DEFINER).
 */

function cleanDbError(message: string): string {
  // رسائل RAISE EXCEPTION تأتي بالعربية من قاعدة البيانات؛ نزيل بادئات PostgREST التقنية.
  return message.replace(/^.*?:\s*/, "").trim() || "تعذّرت العملية.";
}

/** يُنشئ رمز دعوة معلّم جديداً (للمعلمين فقط) ويعيد الرمز. */
export async function createTeacherInvite(note?: string): Promise<string> {
  const { data, error } = await rpc("create_teacher_invite", { _note: note ?? null });
  if (error) throw new Error(cleanDbError(error.message));
  return String(data);
}

/** يستخدم رمز دعوة لمنح صاحب الجلسة دور المعلم. */
export async function redeemTeacherInvite(code: string): Promise<void> {
  const { error } = await rpc("redeem_teacher_invite", { _code: code.trim().toUpperCase() });
  if (error) throw new Error(cleanDbError(error.message));
}

/** نتيجة «أنا معلّم» كما تعيدها activate_teacher_role. */
export type TeacherActivation =
  "invite" | "founder" | "already" | "invalid" | "used" | "expired" | "locked";

const ACTIVATION_ERRORS: Partial<Record<TeacherActivation, string>> = {
  invalid: "الرمز غير صحيح. تأكّد منه واكتبه كما وصلك.",
  used: "هذا الرمز مستخدم من قبل. اطلب رمزاً جديداً.",
  expired: "انتهت صلاحية هذا الرمز. اطلب رمزاً جديداً.",
  locked: "محاولات خاطئة كثيرة. حاول مجدداً بعد ساعة.",
};

/** رسالة الخطأ لحالة فاشلة، أو null إن نجح التفعيل. */
export function activationError(status: TeacherActivation): string | null {
  return ACTIVATION_ERRORS[status] ?? null;
}

/** يوحّد الرمز كما تفعل قاعدة البيانات: حروف وأرقام فقط، بأحرف كبيرة. */
export function normalizeRoleCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * «أنا معلّم»: يفعّل دور المعلم برمز دعوة من معلّم، أو برمز المؤسس لأول معلّم في التطبيق.
 * يرمي خطأً مفهوماً إن فشل، ويعيد نوع التفعيل إن نجح.
 */
export async function activateTeacherRole(code: string): Promise<"invite" | "founder" | "already"> {
  if (normalizeRoleCode(code).length < 4) throw new Error("اكتب الرمز أولاً.");
  const { data, error } = await rpc("activate_teacher_role", { _code: code });
  if (error) throw new Error(cleanDbError(error.message));
  const status = String(data) as TeacherActivation;
  const msg = activationError(status);
  if (msg) throw new Error(msg);
  return status as "invite" | "founder" | "already";
}

/** ما تعيده founder_code_for_me: الرمز لصاحب التطبيق وحده. */
export type FounderCodeForMe =
  { status: "owner"; code: string } | { status: "already" } | { status: "not_owner" };

/** يقرأ الرد بحذر: أي شكل غير متوقَّع يُعامل كأنه ليس صاحب التطبيق. */
export function parseFounderCodeForMe(data: unknown): FounderCodeForMe {
  const d = (data ?? {}) as { status?: unknown; code?: unknown };
  if (d.status === "owner" && typeof d.code === "string" && d.code.trim()) {
    return { status: "owner", code: d.code.trim() };
  }
  if (d.status === "already") return { status: "already" };
  return { status: "not_owner" };
}

/**
 * رمز المؤسس داخل التطبيق: يعيده الخادم لصاحب التطبيق فقط (أقدم حساب أو المحدَّد في app_owner)،
 * فلا يحتاج إلى فتح جدول founder_codes في لوحة قاعدة البيانات.
 */
export async function getFounderCodeForMe(): Promise<FounderCodeForMe> {
  const { data, error } = await rpc("founder_code_for_me");
  // الترحيل غير مطبَّق بعد أو خطأ شبكة: لا نعرض شيئاً ويبقى إدخال الرمز يدوياً متاحاً.
  if (error) return { status: "not_owner" };
  return parseFounderCodeForMe(data);
}
