/**
 * الخروج الموحَّد (تحليل قسم «المزيد»، SEC-01/02/05): مسار واحد لكل أزرار الخروج وحذف الحساب.
 *
 * الترتيب مهم:
 *  1. إلغاء رمز الإشعارات الفورية على الخادم ما دامت الجلسة صالحة، كي لا تصل إشعارات هذا الحساب
 *     إلى من يدخل بعده على الجهاز نفسه.
 *  2. إنهاء الجلسة على هذا الجهاز وحده (`scope: "local"`): الرسالة تقول «من هذا الجهاز»، والنطاق
 *     الافتراضي في supabase-js (`global`) كان يُخرج الحساب من كل أجهزته. supabase-js يمسح الجلسة
 *     المحلية حتى لو تعذّر الاتصال بالخادم.
 *  3. مسح ذاكرة react-query ونسخ «دون اتصال» ومفاتيح التخزين الخاصة بالحساب. تفضيلات الجهاز
 *     (اللغة، الخط، التباين، السمة، المواقيت) تبقى لأنها للجهاز لا للحساب.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { disableNativePush, NATIVE_TOKEN_KEY } from "@/lib/native";
import { clearOfflineCache } from "@/lib/offline/offline-fetch";

/** مفاتيح localStorage التي تخص الحساب المسجَّل (لا الجهاز). */
export const ACCOUNT_STORAGE_KEYS: readonly string[] = [
  NATIVE_TOKEN_KEY,
  "zen-home-mode",
  "zen-feature-flags",
  // = TZ_SYNCED_KEY في lib/account-sync (لا يُستورد كي لا تُسحب مزامنة القراءة إلى حزمة «المزيد»).
  "zen.tz.synced",
];

/** أقصى انتظار لإلغاء رمز الإشعارات قبل المتابعة (دون شبكة لا يُعلَّق الخروج). */
export const PUSH_UNREGISTER_TIMEOUT_MS = 4000;

export function clearAccountStorage(): void {
  for (const k of ACCOUNT_STORAGE_KEYS) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* التخزين معطّل */
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

/** ينظّف الجهاز بعد انتهاء الجلسة (يُستدعى أيضاً بعد حذف الحساب). */
export async function clearDeviceAfterSignOut(qc?: QueryClient): Promise<void> {
  qc?.clear();
  await clearOfflineCache().catch(() => undefined);
  clearAccountStorage();
}

let inFlight: Promise<void> | null = null;

/**
 * يُخرج الحساب من هذا الجهاز. نداءات متزامنة (نقر مزدوج، زرّان) تشترك في الوعد نفسه.
 * لا يرمي: الخروج يجب أن ينجح محلياً دائماً.
 */
export function signOutEverywhere(qc?: QueryClient): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    await withTimeout(disableNativePush(), PUSH_UNREGISTER_TIMEOUT_MS);
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    await clearDeviceAfterSignOut(qc);
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
