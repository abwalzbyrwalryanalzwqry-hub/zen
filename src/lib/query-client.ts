/**
 * إعداد React Query للتطبيق كله (1.16.0: العمل دون اتصال والسلاسة).
 *
 * - `networkMode: "offlineFirst"`: بالوضع الافتراضي («online») يوقف React Query كل استعلام وطلب حين
 *   ينقطع الاتصال فلا تُستدعى `queryFn` أصلاً، فتبقى الشاشة تدور بدل أن تصل إلى نسخة الجهاز
 *   (offline-fetch). الآن تُجرَّب مرة: النسخة المحفوظة تُعرض، وإعادة المحاولة وحدها تنتظر الاتصال.
 * - إعادة المحاولة: لا تُعاد أخطاء الصلاحية والتحقق (4xx ورسائل الخادم المعروفة)، ولا شيء دون اتصال؛
 *   كانت ثلاث محاولات بتأخير متصاعد (≈ 7 ثوانٍ) قبل إظهار أي خطأ.
 * - `staleTime` 30 ثانية: التنقل بين الشاشات يعرض ما في الذاكرة فوراً دون طلب جديد كل مرة، والعودة من
 *   الخلفية وعودة الاتصال تحدّثان ما قدُم (app-resume، refetchOnReconnect). `gcTime` ساعة كي لا يُعاد التحميل
 *   عند الرجوع إلى شاشة سابقة.
 */
import { QueryClient } from "@tanstack/react-query";
import { isOnline } from "@/lib/network";

/** خطأ لا تفيد إعادته: رفض صلاحية أو تحقق أو رسالة معروفة من الخادم. */
export function isPermanentError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const o = e as { status?: unknown; code?: unknown; message?: unknown };
  if (typeof o.status === "number" && o.status >= 400 && o.status < 500) return true;
  // PostgREST: 42501 صلاحية، 22xxx/23xxx بيانات، P0001 RAISE EXCEPTION برسالة معروفة، PGRST1xx/2xx طلب.
  if (typeof o.code === "string" && /^(42501|22|23|P0001|PGRST[12])/.test(o.code)) return true;
  const msg = typeof o.message === "string" ? o.message : "";
  return /^[A-Z][A-Z_]{3,}$/.test(msg.trim()); // رموز الخادم مثل NOT_YOUR_HALAQA
}

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (!isOnline() || isPermanentError(error)) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: "offlineFirst",
        retry: shouldRetry,
        retryDelay: (n) => Math.min(800 * 2 ** n, 4000),
        staleTime: 30_000,
        gcTime: 60 * 60_000,
      },
      mutations: { networkMode: "offlineFirst", retry: false },
    },
  });
}
