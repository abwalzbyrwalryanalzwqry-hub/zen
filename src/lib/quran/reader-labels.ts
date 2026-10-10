// نصوص مشتقة للقارئ: تسمية علامات الأجزاء والأحزاب والأرباع، ورسالة خطأ التحميل المفهومة.
import { t } from "@/lib/i18n";
import { toArabicDigits } from "./format";
import type { PageMarker } from "./page-math";
import { ensureMushafDict } from "@/lib/quran/mushaf-i18n";

// قاموس القارئ الكسول: يُضاف متزامناً قبل أول رسم.
void ensureMushafDict();

/** «الجزء ٤»، «الحزب ٧»، «ربع الحزب ٧»، «نصف الحزب ٧»، «ثلاثة أرباع الحزب ٧»، «موضع سجدة». */
export function markerLabel(m: PageMarker): string {
  if (m.kind === "juz") return t("mushafReader.marker.juz", { n: toArabicDigits(m.no) });
  if (m.kind === "hizb") return t("mushafReader.marker.hizb", { n: toArabicDigits(m.no) });
  if (m.kind === "rub")
    return t(`mushafReader.marker.q${m.quarter}`, { n: toArabicDigits(m.hizb) });
  return t("mushafReader.meta.sajdah");
}

/**
 * رسالة للمستخدم بدل نص الخطأ التقني («HTTP 404»، «Failed to fetch»): انقطاع الاتصال،
 * أو ملف تالف/ناقص يُصلحه إعادة المحاولة أو تحديث التطبيق.
 */
export function friendlyLoadError(error: unknown): string {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (offline || /fetch|network|load failed/i.test(msg)) return t("mushafReader.error.offline");
  return t("mushafReader.error.generic");
}
