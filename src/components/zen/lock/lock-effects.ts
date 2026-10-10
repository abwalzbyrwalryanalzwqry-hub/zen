import { useEffect } from "react";
import { RESUME_EVENT } from "@/lib/app-resume";
import { intlLocale, plural, t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { track } from "@/lib/usage";
import type { LockSnapshot } from "@/lib/app-lock-state";

/**
 * آثار جانبية لقفل التطبيق خارج شاشة القفل (1.29.0)، كلها بتحميل كسول ولا تفتح شيئاً:
 *  - مزامنة «إخفاء نص الإشعارات» مع الخادم لرمز FCM هذا الجهاز (M6).
 *  - ربط القفل بالحساب الحالي مرة واحدة إن لم يُربط (ترقية من 1.28.0، H1).
 *  - إشعار المحاولات الخاطئة منذ آخر مرة بعد الفتح، ثم مسح السجل.
 *  - حدث استعمال مجمّع «lock_active» (مرة في اليوم وبموافقة فقط).
 */
export function useLockSideEffects(snap: LockSnapshot, locked: boolean): void {
  const ready = snap.status === "ready";
  const { enabled, privateNotifications, recoveryAccount, failedSinceUnlock } = snap.state;

  useEffect(() => {
    if (!ready) return;
    const sync = () =>
      void import("@/lib/app-lock-push")
        .then((m) => m.syncLockPushPrivacy())
        .catch(() => undefined);
    sync();
    window.addEventListener(RESUME_EVENT, sync);
    return () => window.removeEventListener(RESUME_EVENT, sync);
  }, [ready, enabled, privateNotifications]);

  useEffect(() => {
    if (!ready || !enabled) return;
    track("lock_active");
  }, [ready, enabled]);

  useEffect(() => {
    if (!ready || !enabled || locked || recoveryAccount) return;
    void import("@/lib/app-lock").then((m) => m.bindRecoveryAccount()).catch(() => undefined);
  }, [ready, enabled, locked, recoveryAccount]);

  useEffect(() => {
    if (!ready || !enabled || locked || failedSinceUnlock <= 0) return;
    void showFailures(snap.state.failedSinceUnlock, snap.state.lastFailedAt);
    // snap.state قيمة اللحظة نفسها.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, enabled, locked, failedSinceUnlock]);
}

async function showFailures(n: number, at: number) {
  try {
    const [{ ensureLockDict }, lock] = await Promise.all([
      import("@/lib/lock-i18n"),
      import("@/lib/app-lock"),
    ]);
    await ensureLockDict();
    const when =
      at > 0
        ? new Intl.DateTimeFormat(intlLocale(), {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(at))
        : null;
    toast.warning(plural("appLock.failures.title", n), {
      description: when ? t("appLock.failures.last", { time: when }) : undefined,
      duration: 15_000,
    });
    // رآه المستخدم: يُمسح السجل (والتطبيق مفتوح؛ الطبقة الأصلية ترفض غير ذلك).
    await lock.ackLockFailures();
  } catch {
    /* صامت: يُعرض في الفتح القادم */
  }
}
