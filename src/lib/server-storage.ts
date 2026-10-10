import { rpc } from "@/integrations/supabase/rpc";

/**
 * حجم قاعدة البيانات والتخزين لصاحب التطبيق (تدقيق أكتوبر 2026، المرحلة 2.3). الحدود حدود خطة Supabase
 * المجانية؛ تجاوز 80% إنذار للترقية أو للتنظيف قبل أن يتوقف الرفع.
 */
export const PLAN_LIMITS = { dbBytes: 500 * 1024 ** 2, storageBytes: 1024 ** 3 } as const;
export const WARN_RATIO = 0.8;

export type StorageUsage = {
  dbBytes: number;
  storageBytes: number;
  buckets: { id: string; objects: number; bytes: number }[];
  purged30d: number;
  pendingPurge: number;
  dbRatio: number;
  storageRatio: number;
  warn: boolean;
};

export function parseStorageUsage(raw: unknown): StorageUsage | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.status !== "ok") return null;
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const buckets = Object.entries((r.buckets ?? {}) as Record<string, Record<string, unknown>>)
    .map(([id, b]) => ({ id, objects: n(b?.objects), bytes: n(b?.bytes) }))
    .sort((a, b) => b.bytes - a.bytes);
  const dbBytes = n(r.db_bytes);
  const storageBytes = buckets.reduce((s, b) => s + b.bytes, 0);
  const dbRatio = dbBytes / PLAN_LIMITS.dbBytes;
  const storageRatio = storageBytes / PLAN_LIMITS.storageBytes;
  return {
    dbBytes,
    storageBytes,
    buckets,
    purged30d: n(r.audio_purged_30d),
    pendingPurge: n(r.audio_pending_purge),
    dbRatio,
    storageRatio,
    warn: dbRatio >= WARN_RATIO || storageRatio >= WARN_RATIO,
  };
}

export async function fetchStorageUsage(): Promise<StorageUsage | null> {
  const { data, error } = await rpc("storage_usage");
  if (error) throw new Error(error.message);
  return parseStorageUsage(data);
}

/** 1536 ⇒ «1.5 KB». */
export function formatBytes(bytes: number, locale = "ar"): string {
  const units = ["B", "KB", "MB", "GB"];
  let v = Math.max(0, bytes);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v)} ${units[i]}`;
}
