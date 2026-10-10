import { useEffect, useState } from "react";
import { KeyRound, Loader2, LockKeyhole, Settings2, ShieldAlert } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { plural, useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import {
  authMessageKey,
  availableMethods,
  biometricReady,
  recoveryOptions,
  waitParts,
  type LockCaps,
  type LockMethod,
  type LockState,
} from "@/lib/app-lock-core";
import {
  authenticate,
  bridgeErrorCode,
  enableDeviceLock,
  openSecuritySettings,
  setupPin,
  verifyPin,
} from "@/lib/app-lock";
import { PinCreate } from "./PinCreate";
import { PinPad } from "./PinPad";

/** نوافذ إعداد القفل وتأكيد الهوية، وملاحظة الاستعادة. */
export function RecoveryNote({ recovery }: { recovery: ReturnType<typeof recoveryOptions> }) {
  const t = useT();
  if (!recovery.any) {
    return (
      <p
        className="text-xs text-foreground leading-relaxed flex gap-2"
        data-testid="lock-no-recovery"
      >
        <ShieldAlert className="size-4 shrink-0 mt-0.5 text-gold" aria-hidden="true" />
        {t("appLock.recovery.none")}
      </p>
    );
  }
  return (
    <ul className="text-xs text-muted-foreground leading-relaxed space-y-1 list-disc ps-4">
      {recovery.device && <li>{t("appLock.recovery.device")}</li>}
      {recovery.account && <li>{t("appLock.recovery.account")}</li>}
    </ul>
  );
}

/** إعداد القفل أو تغيير وسيلته: اختيار الوسيلة المتاحة فعلاً، ثم PIN (إدخال وتأكيد) أو مصادقة النظام. */
export function SetupSheet({
  caps,
  state,
  change,
  initial,
  recovery,
  onClose,
}: {
  caps: LockCaps;
  state: LockState;
  change: boolean;
  initial?: LockMethod;
  recovery: ReturnType<typeof recoveryOptions>;
  onClose: () => void;
}) {
  const t = useT();
  const methods = availableMethods(caps);
  const [step, setStep] = useState<"choose" | "pin">(initial === "pin" ? "pin" : "choose");
  const [method, setMethod] = useState<LockMethod | null>(
    initial ?? (methods.pin ? "pin" : methods.device ? "device" : null),
  );
  const [withBio, setWithBio] = useState(change ? state.biometricWithPin : false);
  const [ack, setAck] = useState(recovery.any);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => {
    const code = bridgeErrorCode(e);
    setError(
      code === "AUTH_REQUIRED"
        ? t("appLock.setup.expired")
        : code?.startsWith("PIN_") && code !== "PIN_UNAVAILABLE"
          ? t(`appLock.pin.problem.${code.slice(4).toLowerCase()}`)
          : t("appLock.setup.failed"),
    );
  };

  const done = () => {
    // أول تفعيل: نصيحة قصيرة بما يحدث الآن (القفل عند المغادرة وإطفاء الشاشة) وأين يُغيَّر.
    if (change) toast.success(t("appLock.setup.changed"));
    else
      toast.success(t("appLock.setup.done"), {
        description: t("appLock.tip.body"),
        duration: 8000,
      });
    onClose();
  };

  const savePin = async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      let bio = false;
      if (withBio && biometricReady(caps)) {
        const r = await authenticate("biometric", "enroll", {
          title: t("appLock.prompt.enrollTitle"),
          subtitle: t("appLock.prompt.enrollSubtitle"),
          negative: t("appLock.prompt.cancel"),
        });
        bio = r.ok;
      }
      await setupPin(pin, bio);
      done();
    } catch (e) {
      fail(e);
      setStep("pin");
    } finally {
      setBusy(false);
    }
  };

  const enrollDevice = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await authenticate("device", "enroll", {
        title: t("appLock.prompt.enrollTitle"),
        subtitle: t("appLock.prompt.enrollSubtitle"),
      });
      if (!r.ok) {
        if (r.code !== "canceled") setError(t(authMessageKey(r.code)));
        return;
      }
      await enableDeviceLock();
      done();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const proceed = () => {
    if (method === "pin") setStep("pin");
    else if (method === "device") void enrollDevice();
  };

  const option = (
    m: LockMethod,
    ok: boolean,
    label: string,
    hint: string,
    Icon: typeof KeyRound,
  ) => (
    <label
      className={`flex items-start gap-3 rounded-2xl p-3 border min-h-14 ${
        method === m ? "border-primary bg-primary/5" : "border-border/60"
      } ${ok ? "cursor-pointer" : "opacity-60"}`}
    >
      <input
        type="radio"
        name="zen-lock-method"
        className="mt-1 size-4 accent-[var(--primary)]"
        checked={method === m}
        disabled={!ok || busy}
        onChange={() => setMethod(m)}
        data-testid={`setup-method-${m}`}
      />
      <Icon className="size-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-xs text-muted-foreground leading-relaxed">{hint}</span>
      </span>
    </label>
  );

  return (
    <Sheet open onOpenChange={(o) => !o && !busy && onClose()}>
      <SheetContent
        title={change ? t("appLock.setup.changeTitle") : t("appLock.setup.title")}
        snap="auto"
        defaultExpanded
      >
        <div className="space-y-4 pb-2" data-testid="lock-setup">
          {step === "choose" ? (
            <>
              <p className="text-sm font-bold">{t("appLock.setup.choose")}</p>
              {option(
                "pin",
                methods.pin,
                t("appLock.method.pin"),
                methods.pin ? t("appLock.method.pinHint") : t("appLock.method.pinUnavailable"),
                KeyRound,
              )}
              {option(
                "device",
                methods.device,
                t("appLock.method.device"),
                methods.device
                  ? t("appLock.method.deviceHint")
                  : t("appLock.method.deviceUnavailable"),
                LockKeyhole,
              )}
              {!methods.device && (
                <button
                  type="button"
                  onClick={() => void openSecuritySettings()}
                  className="glass rounded-xl px-3 min-h-11 text-xs font-bold flex items-center gap-1.5"
                >
                  <Settings2 className="size-3.5" aria-hidden="true" />
                  {t("appLock.bio.openSettings")}
                </button>
              )}
              {method === "pin" && biometricReady(caps) && (
                <label className="flex items-center gap-3 min-h-11">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={withBio}
                    onChange={(e) => setWithBio(e.target.checked)}
                    data-testid="setup-with-bio"
                  />
                  <span className="text-sm">{t("appLock.setup.useBiometric")}</span>
                </label>
              )}
              {method === "pin" && (
                <div className="glass rounded-2xl p-3 space-y-2">
                  <p className="text-xs font-bold">{t("appLock.recovery.title")}</p>
                  <RecoveryNote recovery={recovery} />
                  {!recovery.any && (
                    <label className="flex items-center gap-3 min-h-11">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--primary)]"
                        checked={ack}
                        onChange={(e) => setAck(e.target.checked)}
                        data-testid="setup-ack"
                      />
                      <span className="text-sm">{t("appLock.recovery.ack")}</span>
                    </label>
                  )}
                </div>
              )}
              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 min-h-11 rounded-xl glass text-sm font-bold"
                  onClick={onClose}
                  disabled={busy}
                >
                  {t("appLock.setup.cancel")}
                </button>
                <button
                  type="button"
                  className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  onClick={proceed}
                  disabled={busy || !method || (method === "pin" && !ack)}
                  data-testid="setup-continue"
                >
                  {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  {t("appLock.setup.continue")}
                </button>
              </div>
            </>
          ) : (
            <>
              <PinCreate onDone={(p) => void savePin(p)} busy={busy} error={error} />
              {busy && (
                <p role="status" className="text-xs text-muted-foreground text-center">
                  {t("appLock.setup.saving")}
                </p>
              )}
              <div className="flex justify-center">
                <button
                  type="button"
                  className="min-h-11 px-4 text-sm font-bold text-primary"
                  onClick={() => (initial === "pin" ? onClose() : setStep("choose"))}
                  disabled={busy}
                >
                  {initial === "pin" ? t("appLock.setup.cancel") : t("appLock.setup.back")}
                </button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** تأكيد الهوية برمز PIN (أو بالبصمة إن كانت مفعّلة) قبل تغيير حساس. */
export function ConfirmPinSheet({
  state,
  caps,
  onDone,
}: {
  state: LockState;
  caps: LockCaps;
  onDone: (ok: boolean) => void;
}) {
  const t = useT();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [waitMs, setWaitMs] = useState(state.lockoutMs);
  const bio = state.biometricWithPin && biometricReady(caps);

  useEffect(() => {
    if (waitMs <= 0) return;
    const id = window.setTimeout(() => setWaitMs(Math.max(0, waitMs - 1000)), 1000);
    return () => window.clearTimeout(id);
  }, [waitMs]);

  const submit = async (value: string) => {
    if (busy || waitMs > 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await verifyPin(value, "confirm");
      if (r.ok) {
        onDone(true);
        return;
      }
      setPin("");
      if (r.lockoutMs > 0) setWaitMs(r.lockoutMs);
      else setMsg(plural("appLock.pin.attemptsLeft", r.attemptsLeft));
    } catch {
      setPin("");
      setMsg(t("appLock.pin.unavailable"));
    } finally {
      setBusy(false);
    }
  };

  const viaBio = async () => {
    setBusy(true);
    const r = await authenticate("biometric", "confirm", {
      title: t("appLock.prompt.confirmTitle"),
      subtitle: t("appLock.prompt.confirmSubtitle"),
      negative: t("appLock.prompt.usePin"),
    });
    setBusy(false);
    if (r.ok) onDone(true);
    else if (r.code !== "canceled") setMsg(t(authMessageKey(r.code)));
  };

  const wait = waitMs > 0 ? waitParts(waitMs) : null;
  return (
    <Sheet open onOpenChange={(o) => !o && !busy && onDone(false)}>
      <SheetContent
        title={t("appLock.confirm.title")}
        description={t("appLock.confirm.hint")}
        snap="auto"
        defaultExpanded
      >
        <div className="flex flex-col items-center gap-3 pb-4" data-testid="lock-confirm">
          <p
            role={msg || wait ? "alert" : undefined}
            className="min-h-5 text-sm text-destructive text-center"
          >
            {wait
              ? t("appLock.pin.wait", { wait: plural(`appLock.units.${wait.unit}`, wait.n) })
              : msg}
          </p>
          <PinPad
            value={pin}
            onChange={setPin}
            onSubmit={(v) => void submit(v)}
            length={state.pinLength}
            disabled={busy || waitMs > 0}
            onBiometric={bio ? () => void viaBio() : undefined}
            testId="confirm-pin-pad"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
