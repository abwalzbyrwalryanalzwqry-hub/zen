/**
 * تجديد رمز الدخول دون اتصال (1.16.0). مكتبة Supabase تعيد محاولة التجديد بتأخير متصاعد حتى 30 ثانية
 * عند خطأ الشبكة، وكل طلب بيانات ينتظر `getSession()` الذي ينتظر ذلك التجديد. فكان كل شيء دون اتصال
 * (بعد ساعة من آخر تجديد) يتعلّق نصف دقيقة قبل أن يصل إلى نسخة الجهاز، وكذلك الفتح على شبكة ضعيفة.
 *
 * هنا: دون اتصال يفشل التجديد فوراً بخطأ شبكة قابل للإعادة (فتبقى الجلسة في التخزين ولا خروج)، ومع
 * الاتصال يجري كما هو. وعند عودة الاتصال تُمسح «فترة التهدئة» بعد آخر فشل كي يتجدّد الرمز مباشرة.
 */
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { isOnline } from "@/lib/network";

type RefreshResult = { data: { session: null; user: null } | unknown; error: unknown };
interface AuthInternals {
  _refreshAccessToken?: (refreshToken: string) => Promise<RefreshResult>;
  lastRefreshFailure?: unknown;
  __zenOffline?: boolean;
}

/** يركّب التعديل على عميل المصادقة مرة واحدة. يعيد false إن تغيّرت بنية المكتبة (يحرسه اختبار). */
export function installOfflineAuth(auth: unknown, online: () => boolean = isOnline): boolean {
  const a = auth as AuthInternals;
  if (!a || typeof a._refreshAccessToken !== "function") return false;
  if (a.__zenOffline) return true;
  const original = a._refreshAccessToken.bind(a);
  a._refreshAccessToken = async (refreshToken: string) => {
    if (!online()) {
      return {
        data: { session: null, user: null },
        error: new AuthRetryableFetchError("offline", 0),
      };
    }
    return original(refreshToken);
  };
  a.__zenOffline = true;
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      a.lastRefreshFailure = null;
    });
  }
  return true;
}
