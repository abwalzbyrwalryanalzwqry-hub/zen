/**
 * نسخة Android المضمَّنة (VITE_ZEN_NATIVE=1): الواجهة تُقدَّم من داخل التطبيق بلا خادم ويب.
 *
 * منذ المرحلة 6.5 لا توجد في الواجهة دوال خادم (`createServerFn`)؛ كل ما يحتاج صلاحية أو مفتاحاً
 * يمرّ بدوال Supabase Edge، فيعمل في الويب والتطبيق بمسار واحد (يحرسه `no-server-fns.test.ts`).
 * يبقى هذا الغلاف شبكة أمان: أي نداء `/_serverFn/*` يُرفض فوراً برسالة عربية بدل انتظار طويل.
 */
import { isGuest } from "./guest";

export const IS_NATIVE_BUILD = import.meta.env.VITE_ZEN_NATIVE === "1";

export const MSG_NEEDS_ACCOUNT = "هذه الميزة تحتاج حساباً. سجّل الدخول لاستخدامها.";
export const MSG_NEEDS_SERVER = "هذه الميزة غير متاحة في التطبيق بعد.";

function isServerFnUrl(raw: string): boolean {
  try {
    const u = new URL(raw, location.href);
    return u.origin === location.origin && u.pathname.startsWith("/_serverFn");
  } catch {
    return false;
  }
}

let installed = false;

export function installNativeShim(): void {
  if (!IS_NATIVE_BUILD || installed || typeof window === "undefined") return;
  installed = true;
  const base = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!isServerFnUrl(raw)) return base(input, init);
    throw new Error(isGuest() ? MSG_NEEDS_ACCOUNT : MSG_NEEDS_SERVER);
  };

  // لا عامل خدمة في النسخة المضمَّنة: كل الملفات على الجهاز، وأي نسخة قديمة مخزَّنة تُزال.
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
  }
}

/**
 * صفحات المصحف (ملفات نصية صغيرة، نحو 2.5 ميغابايت) جزء من `public/`، فهي داخل حزمة التطبيق
 * دائماً. في الويب تُحفظ كل صفحة تُفتح، ويمكن تنزيل المصحف كاملاً من الإعدادات.
 */
export const MUSHAF_EMBEDDED = IS_NATIVE_BUILD;
