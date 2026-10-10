/**
 * «التنزيلات والتخزين» (3.10): ما يشغله التطبيق على الجهاز وما يمكن حذفه منه.
 *  - التلاوات المنزَّلة (Filesystem، recitation-offline).
 *  - نسخ «دون اتصال» من بيانات الحساب (Cache Storage، بحدود H7).
 *  - الصور والرسائل الصوتية المنتظرة في الصادر (IndexedDB، M9) — تُعرض ولا تُحذف من هنا لأنها
 *    رسائل لم تصل بعد.
 * المصحف والخطوط مضمَّنة في التطبيق نفسه فلا تُحسب ولا تُحذف.
 */
import { CACHE_MAX_BYTES, readIndex } from "@/lib/offline/cache-policy";
import { clearOfflineCache } from "@/lib/offline/offline-fetch";
import { deleteAllDownloads, listDownloads } from "@/lib/quran/recitation-offline";
import { clearExports, exportTotals, listExports } from "@/lib/export-cache";
import { mediaStore } from "@/lib/chat-media-outbox";
import { t } from "@/lib/i18n";

export type StorageUsage = {
  recitations: { count: number; bytes: number };
  offlineData: { count: number; bytes: number; cap: number };
  pendingMedia: { count: number; bytes: number };
  /** ملفات التصدير المؤقتة (1.17.0): تقارير وشهائد كُتبت للمشاركة. */
  exports: { count: number; bytes: number };
  device: { usage: number; quota: number } | null;
};

export async function storageUsage(): Promise<StorageUsage> {
  const downloads = listDownloads();
  const index = Object.values(readIndex());
  let pending = { count: 0, bytes: 0 };
  try {
    const all = await mediaStore().all();
    pending = { count: all.length, bytes: all.reduce((s, r) => s + (r.blob?.size ?? 0), 0) };
  } catch {
    /* بلا IndexedDB */
  }
  const exports = exportTotals(await listExports());
  let device: StorageUsage["device"] = null;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est && typeof est.usage === "number" && typeof est.quota === "number") {
      device = { usage: est.usage, quota: est.quota };
    }
  } catch {
    /* غير مدعوم */
  }
  return {
    recitations: {
      count: downloads.length,
      bytes: downloads.reduce((s, d) => s + (d.bytes || 0), 0),
    },
    offlineData: {
      count: index.length,
      bytes: index.reduce((s, e) => s + (e.size || 0), 0),
      cap: CACHE_MAX_BYTES,
    },
    pendingMedia: pending,
    exports,
    device,
  };
}

export const clearRecitations = deleteAllDownloads;
export const clearOfflineData = clearOfflineCache;
export const clearExportFiles = clearExports;

/** حجم بوحدات القاموس (بايت، ك.ب، م.ب، ج.ب). */
export function formatBytes(bytes: number): string {
  const b = Math.max(0, bytes);
  if (b < 1024) return t("storage.units.b", { n: b });
  const kb = b / 1024;
  if (kb < 1024) return t("storage.units.kb", { n: Math.round(kb) });
  const mb = kb / 1024;
  if (mb < 1024) return t("storage.units.mb", { n: mb < 10 ? mb.toFixed(1) : Math.round(mb) });
  return t("storage.units.gb", { n: (mb / 1024).toFixed(1) });
}
