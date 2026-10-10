/**
 * مراقبة الأخطاء (المرحلة 8.7) — بلا خدمة خارجية ولا حساب إضافي.
 *
 * كل خطأ غير معالَج في المتصفح (أو يُبلَّغ من حدود الأخطاء) يُرسَل إلى الدالة
 * `log_client_error` التي تكتبه في جدول `client_errors`. الجدول لا يقرؤه إلا صاحب
 * المشروع من لوحة Supabase (`select * from error_summary(7)`).
 *
 * الخصوصية: لا يُرسَل نص إدخال المستخدم ولا معاملات الرابط (تُحذف في الخادم أيضاً)،
 * ويُقصّ المكدّس. وتُدمج الأخطاء المكرّرة في الجلسة، وحدّها 15 خطأً مختلفاً لكل صفحة.
 */
import { lazyRpc as rpc } from "@/integrations/supabase/lazy";

const MAX_PER_PAGE = 15;
const seen = new Set<string>();
let sent = 0;
let installed = false;

/** رقم الإصدار يُحقن وقت البناء إن وُجد (Cloudflare/Lovable)، وإلا «dev». */
export const RELEASE: string =
  (import.meta.env?.VITE_APP_RELEASE as string | undefined) ??
  (import.meta.env?.MODE === "production" ? "prod" : "dev");

/** أخطاء لا فائدة من تسجيلها: انقطاع الشبكة، إلغاء الطلب، إضافات المتصفح. */
export function isNoise(message: string, stack?: string | null): boolean {
  const m = message.toLowerCase();
  if (!m.trim()) return true;
  if (
    m.includes("resizeobserver loop") ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("load failed") ||
    m.includes("aborterror") ||
    m.includes("the user aborted") ||
    m === "script error." ||
    m.includes("non-error promise rejection captured")
  ) {
    return true;
  }
  return /chrome-extension:|moz-extension:|safari-extension:/.test(stack ?? "");
}

export function normalizeError(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`, stack: error.stack ?? null };
  }
  if (typeof error === "string") return { message: error, stack: null };
  try {
    return { message: JSON.stringify(error).slice(0, 500), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

/** يسجّل خطأً واحداً. لا يرمي أبداً: فشل المراقبة لا يجوز أن يكسر التطبيق. */
export function reportError(error: unknown, context?: { boundary?: string }): void {
  if (typeof window === "undefined") return;
  try {
    const { message, stack } = normalizeError(error);
    if (isNoise(message, stack)) return;
    const key = `${message}|${location.pathname}`;
    if (seen.has(key) || sent >= MAX_PER_PAGE) return;
    seen.add(key);
    sent++;
    const tagged = context?.boundary ? `${message} [${context.boundary}]` : message;
    void rpc("log_client_error", {
      _message: tagged.slice(0, 1000),
      _stack: stack ? stack.slice(0, 4000) : null,
      _url: location.pathname,
      _user_agent: navigator.userAgent.slice(0, 300),
      _release: RELEASE,
    }).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    /* تجاهل */
  }
}

/** يثبّت المستمعَين العامّين مرة واحدة (يُستدعى من الجذر بعد التحميل). */
export function installErrorMonitoring(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => reportError(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => reportError(e.reason));
}

/** للاختبارات فقط. */
export function _resetMonitoring(): void {
  seen.clear();
  sent = 0;
}
