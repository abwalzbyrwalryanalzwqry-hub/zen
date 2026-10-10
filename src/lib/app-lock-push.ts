/**
 * قفل التطبيق 1.29.0 (M6): مزامنة «إخفاء نص الإشعارات» مع الخادم لرمز FCM الخاص بهذا الجهاز. الخادم يرسل
 * إلى الرمز الخاص نصاً عاماً بخصوصية PRIVATE (supabase/functions/_shared/push-core.ts)، فلا تظهر العناوين
 * والرسائل على شاشة قفل الجهاز ولا في الشريط وزِن مقفل.
 *
 * القيمة المطلوبة = القفل مفعّل والخيار غير مُطفأ. تُرسل فقط إن تغيّرت لهذا الرمز (رمز جديد يبدأ عاماً على
 * الخادم فيُرسل له من جديد). الفشل صامت ويُعاد عند المرة القادمة (العودة إلى التطبيق أو تغيّر الحالة).
 */
import { lazyRpc as rpc } from "@/integrations/supabase/lazy";
import { lockSnapshot } from "./app-lock-state";

const SYNCED_KEY = "zen-lock-push-private";
let inflight: Promise<"synced" | "skipped" | "failed"> | null = null;

export function wantedPushPrivacy(): boolean | null {
  const s = lockSnapshot();
  if (s.status !== "ready") return null;
  return s.state.enabled && s.state.privateNotifications;
}

function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export function syncLockPushPrivacy(): Promise<"synced" | "skipped" | "failed"> {
  return (inflight ??= run().finally(() => (inflight = null)));
}

async function run(): Promise<"synced" | "skipped" | "failed"> {
  const want = wantedPushPrivacy();
  if (want === null) return "skipped";
  const { savedToken } = await import("@/lib/notify/device");
  const token = savedToken();
  if (!token) return "skipped";
  const mark = `${token.slice(-24)}:${want ? 1 : 0}`;
  if (read(SYNCED_KEY) === mark) return "skipped";
  try {
    const { error } = await rpc("set_native_push_private", { _token: token, _private: want });
    if (error) return "failed";
    localStorage.setItem(SYNCED_KEY, mark);
    return "synced";
  } catch {
    return "failed";
  }
}
