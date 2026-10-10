import { supabase } from "@/integrations/supabase/client";

/**
 * عدد الإشعارات غير المقروءة من الخادم (فحص الأقسام H3): كانت الشارة تعدّ غير المقروء داخل آخر
 * 50 إشعاراً محمَّلاً فقط، فتنقص عند التراكم. `head: true` يعيد العدد دون الصفوف.
 */
export async function countUnreadNotifications(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
  return count ?? 0;
}
