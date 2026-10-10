import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Loader2, LockKeyhole, Settings2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { ZenLogo } from "@/components/zen/ZenLogo";
import { plural, useT } from "@/lib/i18n";
import { useLockDict } from "@/lib/lock-i18n";
import { RESUME_EVENT } from "@/lib/app-resume";
import {
  NO_CAPS,
  authMessageKey,
  biometricReady,
  recoveryOptions,
  waitParts,
  type AuthCode,
  type LockCaps,
} from "@/lib/app-lock-core";
import {
  authenticate,
  bridgeErrorCode,
  hideNativeCover,
  lockCapabilities,
  openSecuritySettings,
  refreshLock,
  verifyPin,
  type LockSnapshot,
} from "@/lib/app-lock";
import { PinPad } from "./PinPad";
import {
  ErrorView,
  LinkButton,
  Message,
  RecoverView,
  ResetView,
  SecondaryButton,
  type View,
} from "./LockRecovery";
import { READ_PATH, enterQuranWhileLocked } from "@/lib/app-lock-quran";
import { track } from "@/lib/usage";

/** اهتزاز قصير عند رمز خاطئ (إن سمح الجهاز؛ لا شيء غير ذلك). */
function buzz() {
  try {
    navigator.vibrate?.([40, 60, 40]);
  } catch {
    /* غير مدعوم */
  }
}

function trackLock(e: "lock_recovered" | "lock_pin_unavailable") {
  track(e);
}

/**
 * شاشة قفل زِن: تحجب التطبيق كله حتى تؤكد الطبقة الأصلية نجاح المصادقة. لا تملك هذه الشاشة طريقاً لفتح
 * القفل بنفسها؛ تختفي فقط حين تقول `ZenLock.getState()` إن التطبيق مفتوح.
 *
 * - قفل الجهاز: نافذة النظام تُعرض تلقائياً مرة عند الظهور، والإلغاء يُبقي القفل مع زر «فتح القفل».
 * - PIN: لوحة أرقام، والبصمة/الوجه اختيارياً (تُعرض تلقائياً مرة)، وعدّاد انتظار بعد المحاولات الخاطئة.
 * - «نسيت الرمز؟»: قفل شاشة الجهاز أو كلمة مرور الحساب ثم وسيلة جديدة. لا تجاوز بنقرة ولا حذف بيانات.
 */
export default function LockScreen({ snap }: { snap: LockSnapshot }) {
  useLockDict();
  const t = useT();
  const { state } = snap;
  const [caps, setCaps] = useState<LockCaps | null>(null);
  const navigate = useNavigate();
  const [view, setView] = useState<View>("main");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState<AuthCode | null>(null);
  const [waitMs, setWaitMs] = useState(state.lockoutMs);
  const autoTried = useRef(false);

  const prompt = {
    title: t("appLock.prompt.unlockTitle"),
    subtitle: t("appLock.prompt.unlockSubtitle"),
    negative: t("appLock.prompt.usePin"),
  };

  // الغطاء الأصلي يُزال بعد أن تُرسم هذه الشاشة فوق المحتوى.
  useEffect(() => {
    const id = requestAnimationFrame(() => void hideNativeCover());
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const load = () => void lockCapabilities().then(setCaps);
    load();
    window.addEventListener(RESUME_EVENT, load);
    return () => window.removeEventListener(RESUME_EVENT, load);
  }, []);

  // عدّاد الانتظار بعد محاولات PIN الخاطئة (القيمة الحاسمة في الطبقة الأصلية؛ هنا للعرض فقط).
  const [seenLockout, setSeenLockout] = useState(state.lockoutMs);
  if (seenLockout !== state.lockoutMs) {
    setSeenLockout(state.lockoutMs);
    setWaitMs(state.lockoutMs);
  }
  const waiting = waitMs > 0;
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => setWaitMs((w) => Math.max(0, w - 1000)), 1000);
    return () => {
      window.clearInterval(id);
      // انتهى الانتظار: الحالة الحاسمة من الطبقة الأصلية من جديد.
      void refreshLock().catch(() => undefined);
    };
  }, [waiting]);

  const c = caps ?? NO_CAPS;
  const bio = state.method === "pin" && state.biometricWithPin && biometricReady(c);
  const recovery = recoveryOptions(c, state);

  const runSystem = useCallback(
    async (mode: "biometric" | "device") => {
      if (busy) return;
      setBusy(true);
      setMsg(null);
      setAuthCode(null);
      const r = await authenticate(mode, "unlock", prompt);
      setBusy(false);
      if (!r.ok) {
        setAuthCode(r.code);
        // الإلغاء في وضع PIN مقصود («استخدام الرمز»): لا رسالة خطأ.
        if (!(mode === "biometric" && r.code === "canceled")) setMsg(t(authMessageKey(r.code)));
      }
    },
    // prompt نصوص ثابتة للغة الحالية.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, t],
  );

  // مرة واحدة عند الظهور (والتطبيق في الواجهة): نافذة النظام مباشرة بلا نقرة إضافية.
  useEffect(() => {
    if (autoTried.current || caps === null || snap.status !== "ready") return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const mode =
      state.method === "device" ? "device" : bio && state.lockoutMs <= 0 ? "biometric" : null;
    if (!mode) return;
    autoTried.current = true;
    const id = window.setTimeout(() => void runSystem(mode), 0);
    return () => window.clearTimeout(id);
  }, [caps, snap.status, state.method, bio, state.lockoutMs, runSystem]);

  const submitPin = async (value: string) => {
    if (busy || waitMs > 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await verifyPin(value, "unlock");
      if (!r.ok) {
        setPin("");
        buzz();
        if (r.lockoutMs > 0) {
          setWaitMs(r.lockoutMs);
        } else {
          setMsg(plural("appLock.pin.attemptsLeft", r.attemptsLeft));
        }
      }
    } catch (e) {
      setPin("");
      const unavailable = bridgeErrorCode(e) === "PIN_UNAVAILABLE";
      if (unavailable) trackLock("lock_pin_unavailable");
      setMsg(unavailable ? t("appLock.pin.unavailable") : t("appLock.auth.unavailable"));
    } finally {
      setBusy(false);
    }
  };

  const waitText = (() => {
    if (waitMs <= 0) return null;
    const w = waitParts(waitMs);
    return t("appLock.pin.wait", { wait: plural(`appLock.units.${w.unit}`, w.n) });
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="zen-lock-title"
      aria-describedby="zen-lock-desc"
      data-testid="app-lock-screen"
      className="fixed inset-0 z-[2147483647] bg-background text-foreground overflow-y-auto overscroll-contain"
    >
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-pattern opacity-[0.06] dark:opacity-[0.08]" />
        <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 w-96 h-96 rounded-full bg-gold/15 blur-3xl" />
      </div>
      <div className="zen-safe relative mx-auto w-full max-w-[440px] min-h-full flex flex-col items-center justify-center gap-5 px-6 py-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="[@media(max-height:620px)]:hidden">
            <ZenLogo size={88} glow={false} />
          </div>
          <h1 id="zen-lock-title" className="text-2xl font-black">
            {view === "main"
              ? t("appLock.lock.welcome")
              : view === "recover"
                ? t("appLock.recover.title")
                : t("appLock.recover.resetTitle")}
          </h1>
          <p id="zen-lock-desc" className="text-sm text-muted-foreground leading-relaxed max-w-xs">
            {view === "main"
              ? t("appLock.lock.subtitle")
              : view === "recover"
                ? t("appLock.recover.hint")
                : t("appLock.recover.resetHint")}
          </p>
        </div>

        {snap.status === "error" ? (
          <ErrorView onRetry={() => void refreshLock().catch(() => undefined)} />
        ) : view === "main" ? (
          state.method === "device" ? (
            <div className="w-full flex flex-col items-center gap-3">
              <Message text={msg} />
              <button
                type="button"
                onClick={() => void runSystem("device")}
                disabled={busy}
                className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                data-testid="lock-unlock"
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                ) : (
                  <LockKeyhole className="size-5" aria-hidden="true" />
                )}
                {authCode ? t("appLock.lock.retry") : t("appLock.lock.unlock")}
              </button>
              {authCode === "no_credential" && (
                <SecondaryButton
                  icon={Settings2}
                  label={t("appLock.bio.openSettings")}
                  onClick={() => void openSecuritySettings()}
                />
              )}
              {authCode === "no_credential" && recovery.account && (
                <LinkButton label={t("appLock.recover.title")} onClick={() => setView("recover")} />
              )}
            </div>
          ) : (
            <div className="w-full flex flex-col items-center gap-3">
              <Message text={waitText ?? msg} />
              <PinPad
                value={pin}
                onChange={setPin}
                onSubmit={(v) => void submitPin(v)}
                length={state.pinLength}
                disabled={busy || waitMs > 0}
                onBiometric={bio ? () => void runSystem("biometric") : undefined}
              />
              <LinkButton
                label={t("appLock.lock.forgot")}
                onClick={() => {
                  setMsg(null);
                  setView("recover");
                }}
                testId="lock-forgot"
              />
            </div>
          )
        ) : view === "recover" ? (
          <RecoverView
            caps={c}
            state={state}
            onBack={() => setView("main")}
            onVerified={() => {
              trackLock("lock_recovered");
              setView("reset");
            }}
          />
        ) : (
          <ResetView caps={c} view={view} setView={setView} />
        )}
        {view === "main" && snap.status === "ready" && state.quranWhileLocked && (
          <SecondaryButton
            icon={BookOpen}
            label={t("appLock.quran.open")}
            onClick={() => {
              enterQuranWhileLocked();
              void navigate({ to: READ_PATH });
            }}
            testId="lock-read-quran"
          />
        )}
      </div>
    </div>
  );
}
