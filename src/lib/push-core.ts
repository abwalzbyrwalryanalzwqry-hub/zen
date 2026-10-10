/**
 * مرسِل الإشعارات الفورية (المرحلة 6.4): يحجز دفعة من `push_outbox` ويرسلها بـ FCM إلى أجهزة Android
 * ثم يختمها. يعمل في دالة Edge «zen-push-dispatch». نسخة مطابقة حرفياً في
 * `supabase/functions/_shared/push-core.ts` (ومعها `fcm.server.ts`).
 *
 * زِن تطبيق Android فقط (6.10): لا Web Push ولا VAPID. اشتراكات المتصفح القديمة إن وُجدت تُتجاهل.
 */
import { PRIVATE_PUSH, sendFcm, type FcmServiceAccount } from "./fcm.server.ts";

/** صف من claim_push_batch. */
export type ClaimedPush = {
  id: string;
  user_id: string;
  category: string;
  title: string;
  body: string | null;
  url: string;
  subscriptions: unknown;
};

/** وسم الإشعار في النظام: تذكير الخادم يحلّ محلّ التذكير المحلي بدل أن يتكرّر. */
export const PUSH_TAG: Record<string, string> = {
  wird: "zen-daily-memorization",
  muhasaba: "muhasaba",
};

type NativeToken = { token: string; platform: "android" | "ios"; private?: boolean };

/** ما يحتاجه المرسِل من قاعدة البيانات (service_role). مجرّد ليُختبر بلا شبكة. */
export type PushStore = {
  enqueueReminders(): Promise<void>;
  claim(limit: number): Promise<ClaimedPush[]>;
  finish(id: string, delivered: string[], gone: string[]): Promise<void>;
};

export type DispatchSummary = { claimed: number; delivered: number; gone: number; failed: number };

function nativeOf(v: unknown): NativeToken[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (s): s is NativeToken =>
      !!s &&
      typeof s === "object" &&
      typeof (s as NativeToken).token === "string" &&
      ((s as NativeToken).platform === "android" || (s as NativeToken).platform === "ios"),
  );
}

/** دفعة واحدة: تذكيرات اليوم (اختياري) ثم الحجز والإرسال والختم. آمنة للتكرار والتوازي. */
export async function dispatchPush(
  store: PushStore,
  fcm: FcmServiceAccount,
  opts: {
    limit?: number;
    reminders?: boolean;
    sendNative?: typeof sendFcm;
  } = {},
): Promise<DispatchSummary> {
  const sendNative = opts.sendNative ?? sendFcm;
  if (opts.reminders) await store.enqueueReminders();
  const batch = await store.claim(opts.limit ?? 50);
  const sum: DispatchSummary = { claimed: batch.length, delivered: 0, gone: 0, failed: 0 };
  for (const row of batch) {
    const tag = PUSH_TAG[row.category] ?? row.category;
    const native = nativeOf(row.subscriptions);
    // قفل التطبيق 1.29.0 (M6): جهاز اختار «إخفاء نص الإشعارات» يتلقى نصاً عاماً بخصوصية PRIVATE.
    const open = native.filter((t) => t.private !== true).map((t) => t.token);
    const hidden = native.filter((t) => t.private === true).map((t) => t.token);
    const results = [
      ...(open.length > 0
        ? await sendNative(open, { title: row.title, body: row.body, url: row.url, tag }, fcm)
        : []),
      ...(hidden.length > 0
        ? await sendNative(hidden, { ...PRIVATE_PUSH, url: row.url, tag, private: true }, fcm)
        : []),
    ];
    const delivered = results.filter((r) => r.ok).map((r) => r.token);
    const gone = results.filter((r) => r.gone).map((r) => r.token);
    sum.delivered += delivered.length;
    sum.gone += gone.length;
    sum.failed += results.length - delivered.length - gone.length;
    await store.finish(row.id, delivered, gone);
  }
  return sum;
}

/** مقارنة سرّ المجدول بزمن ثابت (لا تكشف طول التطابق). */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export type DispatchMode = "cron" | "kick";

/**
 * من يطلب الإرسال: المجدول بسرّ `PUSH_DISPATCH_SECRET`، أو مستخدم مسجّل بعد فعل يولّد إشعاراً
 * (دفعة صغيرة بلا تذكيرات). لا يرسل أي منهما إلا ما هو مستحق أصلاً في `push_outbox`.
 */
export function dispatchPlan(mode: DispatchMode, body: { reminders?: unknown }) {
  return mode === "cron"
    ? { limit: 100, reminders: body.reminders !== false }
    : { limit: 20, reminders: false };
}
