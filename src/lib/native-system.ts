/**
 * جسر `ZenSystem` في Android (android/app/src/main/java/app/zen/quran/ZenSystemPlugin.java).
 * كل ما هنا يعود بهدوء خارج التطبيق.
 *
 *  - H5: مقياس خط النظام ← إعداد «حجم الخط» في التطبيق، ما لم يختر المستخدم حجماً بنفسه.
 *  - L7: تقارير الأعطال الأصلية بموافقة صريحة على هذا الجهاز (معطّلة افتراضياً).
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { lazyRpc as rpc } from "@/integrations/supabase/lazy";
import { getFontScale, isFontScaleChosen, setFontScale, type FontScale } from "@/lib/a11y";

type ZenSystem = {
  getFontScale(): Promise<{ scale: number }>;
  getCrashConsent(): Promise<{ enabled: boolean }>;
  setCrashConsent(o: { enabled: boolean }): Promise<void>;
  takeLastCrash(): Promise<{ crash: string | null }>;
  openNotificationSettings(o: { channel?: string }): Promise<void>;
};
const ZenSystem = registerPlugin<ZenSystem>("ZenSystem");

const native = () => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
};

/** مقياس النظام (1 = عادي، أندرويد يصل إلى 2) ← أقرب حجم في التطبيق. */
export function fontScaleFromSystem(scale: number): FontScale {
  if (!Number.isFinite(scale) || scale <= 0) return "md";
  if (scale < 0.95) return "sm";
  if (scale < 1.15) return "md";
  if (scale < 1.4) return "lg";
  return "xl";
}

/** عند التشغيل: يطبّق خط النظام إن لم يختر المستخدم حجماً بنفسه. */
export async function applySystemFontScale(): Promise<FontScale | null> {
  if (!native() || isFontScaleChosen()) return null;
  try {
    const { scale } = await ZenSystem.getFontScale();
    const next = fontScaleFromSystem(scale);
    if (next !== getFontScale()) setFontScale(next, { fromSystem: true });
    return next;
  } catch {
    return null;
  }
}

export const crashReportingAvailable = native;

export async function getCrashConsent(): Promise<boolean> {
  if (!native()) return false;
  try {
    return (await ZenSystem.getCrashConsent()).enabled;
  } catch {
    return false;
  }
}

export async function setCrashConsent(enabled: boolean): Promise<void> {
  if (!native()) return;
  await ZenSystem.setCrashConsent({ enabled });
}

/** يرسل تقرير العطل السابق (إن وُجد وبموافقة) إلى سجل الأخطاء، مرة واحدة. */
export async function sendPendingCrashReport(release: string): Promise<boolean> {
  if (!native()) return false;
  try {
    const { crash } = await ZenSystem.takeLastCrash();
    if (!crash) return false;
    const [head, ...stack] = crash.split("\n");
    const first = stack.find((l) => l.trim()) ?? "native crash";
    await rpc("log_client_error", {
      _message: `[android] ${first}`.slice(0, 1000),
      _stack: `${head}\n${stack.join("\n")}`.slice(0, 4000),
      _url: "native",
      _user_agent: head.slice(0, 300),
      _release: release,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * إعدادات إشعارات زِن في النظام (1.16.1): الإذن، والصوت والاهتزاز على قناة `zen-default`. يعيد false
 * خارج التطبيق أو إن تعذّر فتحها.
 */
export async function openNotificationSettings(channel?: string): Promise<boolean> {
  if (!native()) return false;
  try {
    await ZenSystem.openNotificationSettings(channel ? { channel } : {});
    return true;
  } catch {
    return false;
  }
}
