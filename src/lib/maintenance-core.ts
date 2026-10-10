/**
 * صيانة دورية بلا مستخدم (تدقيق أكتوبر 2026، المرحلة 2.2): حذف الملفات الصوتية الخام للتسميعات القديمة
 * مع إبقاء نتائجها (الحالة والتقييم والنص والتحليل). PostgreSQL لا يحذف من `storage.objects` مباشرة
 * (Supabase يمنعه)، فالحذف عبر واجهة التخزين من دالة Edge `zen-maintenance` يستدعيها المجدول.
 * بلا اعتماديات؛ نسخته المطابقة في `_shared/maintenance-core.ts`.
 */

export type AudioCandidate = { id: string; audio_path: string };

export interface MaintenanceStore {
  /** تسميعات أقدم من `days` يوماً وليست بانتظار المعلّم، ولها ملف صوتي. */
  audioCandidates(days: number, limit: number): Promise<AudioCandidate[]>;
  /** يحذف الملفات من الحاوية؛ يعيد المسارات التي حُذفت أو لم تعد موجودة. */
  removeObjects(paths: string[]): Promise<string[]>;
  /** يفرّغ audio_path ويضع audio_purged_at للجلسات المعطاة. */
  markPurged(ids: string[]): Promise<void>;
}

export const RETENTION = {
  /** مدة بقاء التسجيل الخام بعد إنشائه (القاعدة 53، وسياسة الخصوصية «مدة الاحتفاظ»). */
  audioDays: 90,
  /** حدّ كل تشغيل؛ الباقي في التشغيل التالي. */
  batch: 200,
  /** حدّ واجهة التخزين لحذف دفعة واحدة. */
  removeChunk: 100,
} as const;

export type PurgeSummary = { candidates: number; removed: number; marked: number };

export async function purgeOldAudio(
  store: MaintenanceStore,
  days: number = RETENTION.audioDays,
  limit: number = RETENTION.batch,
): Promise<PurgeSummary> {
  const safeDays = Math.max(30, Math.floor(days));
  const rows = await store.audioCandidates(safeDays, Math.max(1, Math.min(limit, 1000)));
  let removed = 0;
  let marked = 0;
  for (let i = 0; i < rows.length; i += RETENTION.removeChunk) {
    const chunk = rows.slice(i, i + RETENTION.removeChunk);
    const done = new Set(await store.removeObjects(chunk.map((r) => r.audio_path)));
    removed += done.size;
    // لا تُفرَّغ إلا الجلسات التي حُذف ملفها فعلاً؛ الفاشل يُعاد في التشغيل التالي.
    const ids = chunk.filter((r) => done.has(r.audio_path)).map((r) => r.id);
    if (ids.length) {
      await store.markPurged(ids);
      marked += ids.length;
    }
  }
  return { candidates: rows.length, removed, marked };
}

/**
 * السرّ المقبول لدالة الصيانة (P1-04): `MAINTENANCE_SECRET` متى ضُبط، ولا يُقبل معه سرّ الإشعارات. قبل ضبطه
 * يبقى `PUSH_DISPATCH_SECRET` مقبولاً مؤقتاً (انتقال بلا توقف)، وتُعلَّم الحالة `legacy` للتنبيه في السجل.
 */
export function maintenanceSecret(env: Record<string, string | undefined>): {
  secret: string | null;
  legacy: boolean;
} {
  if (env.MAINTENANCE_SECRET) return { secret: env.MAINTENANCE_SECRET, legacy: false };
  return { secret: env.PUSH_DISPATCH_SECRET || null, legacy: !!env.PUSH_DISPATCH_SECRET };
}
