/**
 * بوابة الذكاء الاصطناعي على الخادم (جاهزية المستودع العام، N-02/N-03). نسخة مطابقة في
 * supabase/functions/_shared/ai-access.ts تستعملها دوال Edge قبل الحصة وقبل أي نداء للمزوّد.
 *
 * الحَكَم هو `public.ai_access_denial(user, feature)` في قاعدة البيانات (مفاتيح الميزات، وموافقة الذكاء النصّي،
 * ومنع القاصر). هنا: ربط الرمز برسالة ورمز HTTP، والفشل مغلق — إن تعذّر السؤال رُفض الطلب.
 */

export type AiFeature = "assistant" | "text" | "recite_ai" | "teacher";

export type AiDenialCode =
  | "AUTH_REQUIRED"
  | "UNKNOWN_FEATURE"
  | "FEATURE_OFF"
  | "CONSENT_REQUIRED"
  | "MINOR_BLOCKED"
  | "CHECK_FAILED";

export const AI_DENIAL: Record<AiDenialCode, { status: number; message: string }> = {
  AUTH_REQUIRED: { status: 401, message: "سجّل الدخول لاستخدام هذه الميزة." },
  UNKNOWN_FEATURE: { status: 400, message: "ميزة غير معروفة." },
  FEATURE_OFF: { status: 403, message: "هذه الميزة غير متاحة حالياً." },
  CONSENT_REQUIRED: {
    status: 403,
    message: "تحتاج هذه الميزة موافقتك على إرسال النص إلى مزوّد الذكاء الاصطناعي.",
  },
  MINOR_BLOCKED: {
    status: 403,
    message: "ميزات الذكاء الاصطناعي غير متاحة لحسابات من هم دون 13 سنة أو المرتبطة بوليّ أمر.",
  },
  CHECK_FAILED: { status: 503, message: "تعذّر التحقق من الصلاحية الآن. حاول بعد قليل." },
};

export type AiDenial = { code: AiDenialCode; status: number; message: string };

type RpcResult = { data: unknown; error: { message: string } | null };
export type DenialRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

function toDenial(code: AiDenialCode): AiDenial {
  return { code, ...AI_DENIAL[code] };
}

/** null = مسموح. أي رمز غير معروف أو خطأ ⇒ رفض (الفشل مغلق). */
export async function checkAiAccess(
  rpc: DenialRpc,
  userId: string,
  feature: AiFeature,
): Promise<AiDenial | null> {
  let r: RpcResult;
  try {
    r = await rpc("ai_access_denial", { _user: userId, _feature: feature });
  } catch {
    return toDenial("CHECK_FAILED");
  }
  if (r.error) return toDenial("CHECK_FAILED");
  if (r.data == null) return null;
  const code = String(r.data) as AiDenialCode;
  return code in AI_DENIAL ? toDenial(code) : toDenial("CHECK_FAILED");
}
