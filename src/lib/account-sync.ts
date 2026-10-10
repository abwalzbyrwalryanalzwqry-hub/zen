/**
 * ما يُزامَن مع الحساب عند فتح التطبيق للمسجَّل:
 *  - H4: حالة القراءة (العلامات والختمة والسجل) عبر sync_quran_state.
 *  - H3: منطقة الجهاز الزمنية عبر set_my_timezone (مرة عند تغيّرها)، فيصير «اليوم» على الخادم
 *    (zen_today: طابور اليوم والسلسلة والمراجعة) بتوقيت المستخدم لا عدن للجميع.
 */
import { rpc } from "@/integrations/supabase/rpc";
import { startReadingSync, type ServerState } from "@/lib/quran/reading-sync";

export const TZ_SYNCED_KEY = "zen.tz.synced";

export function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export async function syncTimezone(): Promise<void> {
  const tz = deviceTimezone();
  if (!tz) return;
  try {
    if (localStorage.getItem(TZ_SYNCED_KEY) === tz) return;
    const { error } = await rpc("set_my_timezone", { _timezone: tz });
    if (!error) localStorage.setItem(TZ_SYNCED_KEY, tz);
  } catch {
    /* بلا شبكة: تُعاد المحاولة في الفتح التالي */
  }
}

async function syncRpc(args: Record<string, unknown>): Promise<ServerState> {
  const { data, error } = await rpc("sync_quran_state", args as never);
  if (error) throw error;
  return (data ?? {}) as ServerState;
}

/** يبدأ المزامنة ويعيد دالة الإيقاف (عند الخروج). */
export function startAccountSync(): () => void {
  void syncTimezone();
  return startReadingSync(syncRpc);
}
