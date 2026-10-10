import { Capacitor } from "@capacitor/core";
import { focusManager } from "@tanstack/react-query";

/**
 * العودة إلى التطبيق (فحص الأقسام، بقايا P2): WebView لا يطلق `visibilitychange` بثبات عند الرجوع من
 * الخلفية على كل الأجهزة، فنربط `appStateChange` من Capacitor بـ focusManager (تُحدَّث الاستعلامات
 * القديمة)، ونبثّ حدث `zen:resume` للشاشات التي تحمّل بياناتها يدوياً (قائمة المحادثات والتنبيهات).
 */
export const RESUME_EVENT = "zen:resume";
let last = 0;

export function emitResume(now = Date.now()): boolean {
  // نداءان متقاربان (visibilitychange + appStateChange) = عودة واحدة.
  if (now - last < 1500) return false;
  last = now;
  window.dispatchEvent(new Event(RESUME_EVENT));
  return true;
}

export function installAppResume(): () => void {
  const onVisible = () => {
    if (document.visibilityState === "visible") emitResume();
  };
  document.addEventListener("visibilitychange", onVisible);
  let remove: (() => void) | undefined;
  if (Capacitor.isNativePlatform()) {
    void import("@capacitor/app").then(({ App }) =>
      App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) return focusManager.setFocused(false);
        // true يطلق إعادة جلب الاستعلامات القديمة، ثم نعيد التتبّع الافتراضي (visibilitychange).
        focusManager.setFocused(true);
        focusManager.setFocused(undefined);
        emitResume();
      }).then((h) => {
        remove = () => void h.remove();
      }),
    );
  }
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    remove?.();
  };
}

/** للاختبارات فقط. */
export function __resetResume() {
  last = 0;
}
