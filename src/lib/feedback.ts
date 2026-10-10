/**
 * «أبلغ عن مشكلة أو اقترح» (تحليل «المزيد» GAP-02): رسالة المستخدم مع سياق تقني قصير يساعد على
 * إعادة المشكلة — الإصدار، والمنصة، ولغة الواجهة، والصفحة التي جاء منها — ولا شيء غير ذلك.
 * الخادم يفرض: صاحب الرسالة هو المرسِل، و5–2000 حرف، و5 رسائل في الساعة (`feedback`، الفحص 132).
 */
import { supabase } from "@/integrations/supabase/client";
import { APP_VERSION } from "@/lib/app-version";
import { getLocale, t } from "@/lib/i18n";
import { nativePlatform } from "@/lib/native";

export const FEEDBACK_KINDS = ["bug", "idea", "content", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_MIN = 5;
export const FEEDBACK_MAX = 2000;

export type FeedbackDraft = { kind: FeedbackKind; message: string; route?: string };

/** خطأ يُعرض للمستخدم أو null إن صلحت المسودة (يطابق قيود الخادم). */
export function feedbackError(d: FeedbackDraft): string | null {
  const len = d.message.trim().length;
  if (len < FEEDBACK_MIN) return t("feedback.tooShort", { n: FEEDBACK_MIN });
  if (len > FEEDBACK_MAX) return t("feedback.tooLong", { n: FEEDBACK_MAX });
  return null;
}

/** مسار داخلي آمن للسياق: بلا استعلام ولا وسم (قد يحملان رموزاً أو أسماء). */
export function safeRoute(r: string | undefined): string | null {
  if (!r || !r.startsWith("/") || r.startsWith("//")) return null;
  return r.split(/[?#]/)[0].slice(0, 200);
}

export async function sendFeedback(d: FeedbackDraft): Promise<void> {
  const bad = feedbackError(d);
  if (bad) throw new Error(bad);
  const { error } = await supabase.from("feedback").insert({
    kind: d.kind,
    message: d.message.trim(),
    app_version: APP_VERSION,
    platform: nativePlatform() ?? "web",
    locale: getLocale(),
    route: safeRoute(d.route),
  });
  if (error) {
    throw new Error(
      /FEEDBACK_RATE_LIMIT/.test(error.message) ? t("feedback.rateLimited") : t("feedback.failed"),
    );
  }
}

export type FeedbackRow = {
  id: string;
  kind: FeedbackKind;
  message: string;
  app_version: string | null;
  platform: string | null;
  locale: string | null;
  route: string | null;
  status: "new" | "seen" | "done";
  created_at: string;
};

/** لصاحب التطبيق: أحدث البلاغات (RLS تعطي غيره رسائله فقط). */
export async function listFeedback(limit = 100): Promise<FeedbackRow[]> {
  const { data, error } = await supabase
    .from("feedback")
    .select("id, kind, message, app_version, platform, locale, route, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as FeedbackRow[];
}

export async function setFeedbackStatus(id: string, status: FeedbackRow["status"]): Promise<void> {
  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
  if (error) throw error;
}
