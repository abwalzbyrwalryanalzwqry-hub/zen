import { useState } from "react";
import { Fingerprint, KeyRound, Loader2, RotateCw, ShieldOff } from "lucide-react";
import { useT } from "@/lib/i18n";
import { isOnline } from "@/lib/network";
import {
  accountLabel,
  authMessageKey,
  recoverErrorKey,
  recoveryOptions,
  waitParts,
  type LockCaps,
  type LockState,
} from "@/lib/app-lock-core";
import { plural } from "@/lib/i18n";
import {
  authenticate,
  bridgeErrorCode,
  disableAppLock,
  enableDeviceLock,
  recoverWithAccount,
  setupPin,
} from "@/lib/app-lock";
import { PinCreate } from "./PinCreate";

/** أجزاء شاشة القفل: الرسائل والأزرار، و«نسيت الرمز؟»، وإعداد وسيلة جديدة بعد الاستعادة. */
export type View = "main" | "recover" | "reset" | "resetPin";

export function Message({ text }: { text: string | null }) {
  return (
    <p
      role={text ? "alert" : undefined}
      className="min-h-5 text-sm text-destructive text-center leading-relaxed"
      data-testid="lock-message"
    >
      {text}
    </p>
  );
}

export function ErrorView({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div className="w-full flex flex-col items-center gap-3">
      <Message text={t("appLock.lock.error")} />
      <button
        type="button"
        onClick={onRetry}
        className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2"
      >
        <RotateCw className="size-5" aria-hidden="true" />
        {t("appLock.lock.retry")}
      </button>
    </div>
  );
}

export function SecondaryButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  testId,
  tone,
}: {
  icon: typeof KeyRound;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`w-full min-h-12 rounded-2xl glass-strong font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 ${
        tone === "danger" ? "text-destructive" : "text-foreground"
      }`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

export function LinkButton({
  label,
  onClick,
  testId,
}: {
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="min-h-11 px-4 text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
    >
      {label}
    </button>
  );
}

/** نسيت الرمز: تحقق حقيقي بقفل الجهاز أو بكلمة مرور الحساب، وإلا شرح صريح بلا تجاوز. */
export function RecoverView({
  caps,
  state,
  onBack,
  onVerified,
}: {
  caps: LockCaps;
  state: LockState;
  onBack: () => void;
  onVerified: () => void;
}) {
  const t = useT();
  const opts = recoveryOptions(caps, state);
  const email = accountLabel(state.accountEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const viaDevice = async () => {
    setBusy(true);
    setMsg(null);
    const r = await authenticate("device", "recover", {
      title: t("appLock.prompt.recoverTitle"),
      subtitle: t("appLock.prompt.recoverSubtitle"),
    });
    setBusy(false);
    if (r.ok) onVerified();
    else setMsg(t(authMessageKey(r.code)));
  };

  const viaAccount = async () => {
    if (!password || busy) return;
    if (!isOnline()) {
      setMsg(t("appLock.recover.offline"));
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await recoverWithAccount(password);
      setPassword("");
      onVerified();
    } catch (e) {
      // H1: الطبقة الأصلية تحققت لدى الخادم؛ الرمز يحدد الرسالة، ومعه مدة الانتظار إن وُجدت.
      const code = bridgeErrorCode(e);
      const wait = (e as { data?: { lockoutMs?: unknown } } | null)?.data?.lockoutMs;
      if (typeof wait === "number" && wait > 0) {
        const w = waitParts(wait);
        setMsg(t("appLock.pin.wait", { wait: plural(`appLock.units.${w.unit}`, w.n) }));
      } else {
        setMsg(t(recoverErrorKey(code)));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-stretch gap-3" data-testid="lock-recover">
      <Message text={msg} />
      {opts.device && (
        <SecondaryButton
          icon={Fingerprint}
          label={t("appLock.recover.device")}
          onClick={() => void viaDevice()}
          disabled={busy}
          testId="recover-device"
        />
      )}
      {opts.account && (
        <form
          className="glass-strong rounded-3xl p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void viaAccount();
          }}
        >
          <label htmlFor="zen-lock-recover-pw" className="block text-sm font-bold">
            {t("appLock.recover.account")}
          </label>
          {email && (
            <p className="text-xs text-muted-foreground" dir="ltr">
              {email}
            </p>
          )}
          <input
            id="zen-lock-recover-pw"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("appLock.recover.password")}
            className="w-full glass rounded-xl px-3 min-h-11 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            data-testid="recover-password"
          />
          <button
            type="submit"
            disabled={!password || busy}
            className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            data-testid="recover-verify"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {t("appLock.recover.verify")}
          </button>
        </form>
      )}
      {!opts.any && (
        <p
          className="glass-strong rounded-2xl p-4 text-sm leading-relaxed"
          data-testid="recover-none"
        >
          {t("appLock.recover.none")}
        </p>
      )}
      <LinkButton label={t("appLock.recover.back")} onClick={onBack} />
    </div>
  );
}

/** بعد الاستعادة: وسيلة جديدة (رمز أو قفل الجهاز) أو إيقاف القفل. لا يُحذف أي شيء من بيانات زِن. */
export function ResetView({
  caps,
  view,
  setView,
}: {
  caps: LockCaps;
  view: View;
  setView: (v: View) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fail = (e: unknown) => {
    if (bridgeErrorCode(e) === "AUTH_REQUIRED") {
      setMsg(null);
      setView("recover");
      return;
    }
    setMsg(t("appLock.setup.failed"));
  };

  const savePin = async (pin: string) => {
    setBusy(true);
    try {
      await setupPin(pin, false);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const enrollDevice = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await authenticate("device", "enroll", {
        title: t("appLock.prompt.enrollTitle"),
        subtitle: t("appLock.prompt.enrollSubtitle"),
      });
      if (!r.ok) {
        setMsg(t(authMessageKey(r.code)));
        return;
      }
      await enableDeviceLock();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await disableAppLock();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  if (view === "resetPin") {
    return (
      <div className="w-full flex flex-col items-center gap-2">
        <PinCreate onDone={(p) => void savePin(p)} busy={busy} error={msg} />
        <LinkButton label={t("appLock.recover.back")} onClick={() => setView("reset")} />
      </div>
    );
  }
  return (
    <div className="w-full flex flex-col items-stretch gap-3" data-testid="lock-reset">
      <Message text={msg} />
      {caps.pinSupported && (
        <SecondaryButton
          icon={KeyRound}
          label={t("appLock.recover.newPin")}
          onClick={() => {
            setMsg(null);
            setView("resetPin");
          }}
          disabled={busy}
          testId="reset-new-pin"
        />
      )}
      {caps.deviceSecure && (
        <SecondaryButton
          icon={Fingerprint}
          label={t("appLock.recover.useDevice")}
          onClick={() => void enrollDevice()}
          disabled={busy}
          testId="reset-use-device"
        />
      )}
      <SecondaryButton
        icon={ShieldOff}
        label={t("appLock.recover.turnOff")}
        onClick={() => void turnOff()}
        disabled={busy}
        testId="reset-turn-off"
        tone="danger"
      />
    </div>
  );
}
