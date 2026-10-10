/**
 * مشاركة التطبيق وتقييمه (تحليل «المزيد» GAP-05). على Android: ورقة المشاركة من النظام، والتقييم يفتح
 * صفحة التطبيق في Google Play مباشرة. على المتصفح: مشاركة الويب إن وُجدت، وإلا نسخ الرابط.
 */
import { t } from "@/lib/i18n";
import { isNativeApp, nativePlatform } from "@/lib/native";

export const APP_ID = "app.zen.quran";
export const PLAY_URL = `https://play.google.com/store/apps/details?id=${APP_ID}`;

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

export async function shareApp(): Promise<ShareResult> {
  const text = t("support.shareText", { url: PLAY_URL });
  if (isNativeApp()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: t("aboutApp.name"), text, url: PLAY_URL });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title: t("aboutApp.name"), text, url: PLAY_URL });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

/** التقييم متاح في نسخة Android وحدها (المتجر الوحيد للتطبيق). */
export const canRateApp = () => nativePlatform() === "android";

export function rateApp(): void {
  // window.open لا يعمل في WebView؛ أما الانتقال إلى نطاق خارجي فيحوّله Capacitor إلى Intent يلتقطه
  // تطبيق Play مباشرة، ويبقى التطبيق في صفحته.
  window.location.assign(PLAY_URL);
}

/** مشاركة نص عام (ملخص اليوم مثلاً، DR-30): مشاركة النظام، أو الحافظة احتياطاً. */
export async function shareText(title: string, text: string): Promise<ShareResult> {
  if (isNativeApp()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, text });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title, text });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
