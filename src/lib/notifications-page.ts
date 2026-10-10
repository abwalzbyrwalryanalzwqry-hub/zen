import { supabase } from "@/integrations/supabase/client";
import type { NotificationRow } from "@/lib/zen-lms";
import { t } from "@/lib/i18n";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

/**
 * صندوق التنبيهات على دفعات (فحص الأقسام P2، بقايا): كانت الصفحة تحمّل آخر 50 فقط فلا يُرى ما قبلها.
 * المؤشّر هو `created_at` لآخر صف (ترتيب تنازلي)، ونطلب صفاً زائداً لنعرف أن بعده المزيد.
 */
export const NOTIFICATIONS_PAGE = 30;

export async function fetchNotificationsPage(
  userId: string,
  before?: string,
  size = NOTIFICATIONS_PAGE,
): Promise<{ rows: NotificationRow[]; more: boolean }> {
  let q = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(size + 1);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) throw error;
  const all = (data ?? []) as NotificationRow[];
  return { rows: all.slice(0, size), more: all.length > size };
}

/** رابط التنبيه داخل التطبيق فقط: مسار يبدأ بـ «/» وليس «//» (لا روابط خارجية من بيانات الخادم). */
export function internalLink(link: string | null | undefined): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//")) return null;
  return link;
}

/**
 * عنوان التنبيه بلغة الواجهة لما له نوع معروف (DR-27): الخادم يكتب العنوان العربي للإشعار المدفوع، والواجهة
 * تترجمه بالنوع؛ غير المعروف يُعرض كما خزّنه الخادم.
 */
const TITLED_KINDS: Record<string, string> = { daily_record: "dailyRecord.notification.completed" };
export function notificationTitle(n: Pick<NotificationRow, "kind" | "title">): string {
  const key = TITLED_KINDS[n.kind];
  return key ? t(key) : n.title;
}
