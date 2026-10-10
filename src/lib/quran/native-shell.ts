/* زِن — تكامل قارئ المصحف مع الغلاف الأصلي (Android).
 *
 * - معترضات زر الرجوع: يستهلك القارئ الضغطة للخروج من ملء الشاشة قبل مغادرة الشاشة.
 *   يقرؤها معالج الرجوع الموحَّد في `src/lib/native.ts` قبل أي قرار آخر.
 * - الوضع الغامر: إخفاء شريط الحالة في أندرويد، وملء الشاشة في المتصفح.
 */

import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** معترضات زر الرجوع (الأحدث أولاً): تعيد true إن استهلكت الضغطة. */
const backInterceptors: (() => boolean)[] = [];

export function addBackInterceptor(fn: () => boolean): () => void {
  backInterceptors.push(fn);
  return () => {
    const i = backInterceptors.lastIndexOf(fn);
    if (i >= 0) backInterceptors.splice(i, 1);
  };
}

/** يمرّر الضغطة على المعترضات؛ true إن استهلكها أحدها. */
export function runBackInterceptors(): boolean {
  for (let i = backInterceptors.length - 1; i >= 0; i--) {
    if (backInterceptors[i]()) return true;
  }
  return false;
}

/** وضع القراءة الغامر: إخفاء شريط الحالة في أندرويد، وملء الشاشة في المتصفح. */
export async function setImmersiveChrome(on: boolean): Promise<void> {
  try {
    if (isNativeApp()) {
      const { StatusBar } = await import("@capacitor/status-bar");
      if (on) await StatusBar.hide();
      else await StatusBar.show();
      return;
    }
    if (typeof document === "undefined") return;
    if (on && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } else if (!on && document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  } catch (error) {
    // تجميلي: قد يرفضه المتصفح (بلا تفاعل مستخدم مثلاً) ويبقى العرض الغامر داخل الصفحة.
    console.warn("[zen] immersive chrome unavailable", error);
  }
}
