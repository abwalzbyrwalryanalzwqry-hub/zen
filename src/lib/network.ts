/**
 * حالة الاتصال (M7). `navigator.onLine` وحده غير موثوق داخل WebView في Android: يبقى `true` أحياناً مع
 * شبكة Wi-Fi بلا إنترنت، أو لا يُطلق `online` بعد عودة الشبكة. في التطبيق نعتمد `@capacitor/network`
 * (حالة النظام نفسه)، ونُطلق حدثَي `online`/`offline` على `window` عند تغيّرها، فيعمل كل مستمع قائم
 * (صندوق سجل الحلقة، والمحادثات، ومحاسبتي) دون تعديل.
 *
 * خارج التطبيق (اختبارات E2E في Chrome) يبقى `navigator.onLine` هو المصدر.
 */
import { Capacitor } from "@capacitor/core";

type Listener = (online: boolean) => void;

let nativeState: boolean | null = null;
let started = false;
const listeners = new Set<Listener>();

function browserOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** هل الجهاز متصل الآن؟ حالة النظام في التطبيق، و`navigator.onLine` خارجه. */
export function isOnline(): boolean {
  return nativeState ?? browserOnline();
}

/** يستمع لتغيّر الاتصال ويعيد دالة الإلغاء. */
export function onNetworkChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(online: boolean) {
  for (const fn of listeners) fn(online);
}

/** يطبّق حالة جديدة من النظام: يُطلق الحدث المناسب على window إن تغيّرت. دالة مُصدَّرة للاختبار. */
export function applyNativeStatus(connected: boolean): void {
  const before = isOnline();
  nativeState = connected;
  if (before === connected) return;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(connected ? "online" : "offline"));
  }
  emit(connected);
}

/** يبدأ مراقبة الاتصال الأصلية مرة واحدة (من الجذر). خارج التطبيق يربط أحداث المتصفح فقط. */
export async function startNetworkMonitor(): Promise<void> {
  if (started || typeof window === "undefined") return;
  started = true;
  if (!Capacitor.isNativePlatform()) {
    window.addEventListener("online", () => emit(true));
    window.addEventListener("offline", () => emit(false));
    return;
  }
  try {
    const { Network } = await import("@capacitor/network");
    const status = await Network.getStatus();
    applyNativeStatus(status.connected);
    await Network.addListener("networkStatusChange", (s) => applyNativeStatus(s.connected));
  } catch {
    // المكوّن غير متاح (نسخة قديمة من الغلاف): نعود إلى navigator.onLine.
    nativeState = null;
  }
}

/** للاختبارات فقط. */
export function __resetNetworkForTest(): void {
  nativeState = null;
  started = false;
  listeners.clear();
}
