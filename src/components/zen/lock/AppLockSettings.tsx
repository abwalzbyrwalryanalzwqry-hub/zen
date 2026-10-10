import { useCallback, useEffect, useState } from "react";
import { Fingerprint, KeyRound, Loader2, Settings2 } from "lucide-react";
import { SettingRow } from "@/components/zen/settings/SettingsShell";
import { SettingsSection } from "@/components/zen/more/SettingsSection";
import { Switch } from "@/components/zen/more/Switch";
import { useT } from "@/lib/i18n";
import { useLockDict } from "@/lib/lock-i18n";
import { toast } from "@/lib/toast";
import { RESUME_EVENT } from "@/lib/app-resume";
import {
  GRACE_OPTIONS,
  authMessageKey,
  availableMethods,
  biometricReady,
  graceKey,
  recoveryOptions,
  type LockCaps,
  type LockMethod,
} from "@/lib/app-lock-core";
import {
  appLockAvailable,
  authenticate,
  bridgeErrorCode,
  disableAppLock,
  lockCapabilities,
  currentAccount,
  openSecuritySettings,
  setBiometricWithPin,
  setLockOptions,
  useAppLock,
} from "@/lib/app-lock";
import type { LockAccount } from "@/lib/app-lock-state";
import { ConfirmPinSheet, SetupSheet } from "./LockSetupSheets";
import { AutoLockSection, LockNowSection, PrivacyExtras, RecoverySection } from "./AppLockExtras";

/**
 * «الإعدادات ← قفل التطبيق». كل تغيير يمرّ بالطبقة الأصلية، وهي التي ترفض ما لم يسبقه تحقق:
 * تشغيل القفل لا يُعرض مفعّلاً قبل نجاح الإعداد وحفظه، والإيقاف وتغيير الوسيلة أو الرمز يحتاجان تأكيد
 * الهوية بالوسيلة الحالية. الوسائل غير المتاحة على الجهاز تظهر معطّلة مع سببها، لا كأزرار شكلية.
 */
export function AppLockSettings() {
  useLockDict();
  const t = useT();
  const { state, status } = useAppLock();
  const [caps, setCaps] = useState<LockCaps | null>(null);
  const [account, setAccount] = useState<LockAccount | null>(null);
  const [setup, setSetup] = useState<null | { change: boolean; method?: LockMethod }>(null);
  const [confirm, setConfirm] = useState<null | ((ok: boolean) => void)>(null);
  const [busy, setBusy] = useState(false);
  const native = appLockAvailable();

  useEffect(() => {
    if (!native) return;
    const load = () => {
      void lockCapabilities().then(setCaps);
      void currentAccount().then(setAccount);
    };
    load();
    // العودة من إعدادات الأمان في النظام (بصمة أو قفل شاشة جديد) تحدّث الإمكانات.
    window.addEventListener(RESUME_EVENT, load);
    return () => window.removeEventListener(RESUME_EVENT, load);
  }, [native]);

  const prompt = useCallback(
    (kind: "confirm" | "enroll") => ({
      title: t(kind === "confirm" ? "appLock.prompt.confirmTitle" : "appLock.prompt.enrollTitle"),
      subtitle: t(
        kind === "confirm" ? "appLock.prompt.confirmSubtitle" : "appLock.prompt.enrollSubtitle",
      ),
      negative: t("appLock.prompt.cancel"),
    }),
    [t],
  );

  /** تأكيد الهوية بالوسيلة الحالية قبل تغيير حساس. */
  const confirmIdentity = useCallback(async (): Promise<boolean> => {
    if (state.method === "device") {
      const r = await authenticate("device", "confirm", prompt("confirm"));
      if (!r.ok && r.code !== "canceled") toast.error(t(authMessageKey(r.code)));
      return r.ok;
    }
    return new Promise<boolean>((resolve) => setConfirm(() => resolve));
  }, [state.method, prompt, t]);

  if (!native) {
    return (
      <SettingsSection id="app-lock" variant="card" title={t("appLock.title")}>
        <SettingRow
          id="zen-lock-enable"
          label={t("appLock.enable")}
          hint={t("appLock.nativeOnly")}
          control={<Switch labelledBy="zen-lock-enable" on={false} onChange={() => {}} disabled />}
        />
      </SettingsSection>
    );
  }

  if (status !== "ready" || caps === null) {
    return (
      <SettingsSection id="app-lock" variant="card" title={t("appLock.title")}>
        <p className="text-sm text-muted-foreground flex items-center gap-2" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t("appLock.loading")}
        </p>
      </SettingsSection>
    );
  }

  const methods = availableMethods(caps);
  const canEnable = methods.pin || methods.device;

  const toggle = async (next: boolean) => {
    if (busy) return;
    if (next) {
      setSetup({ change: false });
      return;
    }
    setBusy(true);
    try {
      if (!(await confirmIdentity())) return;
      await disableAppLock();
      toast.success(t("appLock.disabled"));
    } catch (e) {
      toast.error(
        bridgeErrorCode(e) === "AUTH_REQUIRED"
          ? t("appLock.setup.expired")
          : t("appLock.setup.failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const change = async (method?: LockMethod) => {
    if (busy) return;
    setBusy(true);
    try {
      if (await confirmIdentity()) setSetup({ change: true, method });
    } finally {
      setBusy(false);
    }
  };

  const toggleBio = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (next) {
        const r = await authenticate("biometric", "enroll", prompt("enroll"));
        if (!r.ok) {
          if (r.code !== "canceled") toast.error(t(authMessageKey(r.code)));
          return;
        }
      }
      await setBiometricWithPin(next);
    } catch {
      toast.error(t("appLock.setup.failed"));
    } finally {
      setBusy(false);
    }
  };

  const setOption = async (o: { graceMs?: number; hideInRecents?: boolean }) => {
    try {
      await setLockOptions(o);
    } catch {
      toast.error(t("appLock.setup.failed"));
    }
  };

  // قبل التفعيل: ما سيكون بعده (الحساب الحالي يُربط، والاستعادة بقفل الجهاز لمن لا حساب له فقط).
  const recovery = recoveryOptions(
    caps,
    state.enabled ? state : { deviceRecovery: !account, recoveryAccount: !!account },
  );

  return (
    <>
      <SettingsSection id="app-lock" variant="card" title={t("appLock.title")}>
        <SettingRow
          id="zen-lock-enable"
          label={t("appLock.enable")}
          hint={canEnable ? t("appLock.enableHint") : t("appLock.method.deviceUnavailable")}
          control={
            <Switch
              labelledBy="zen-lock-enable"
              on={state.enabled}
              disabled={busy || (!state.enabled && !canEnable)}
              onChange={(v) => void toggle(v)}
            />
          }
        />
        <p className="text-xs text-muted-foreground leading-relaxed">{t("appLock.localNote")}</p>
      </SettingsSection>

      {state.enabled && (
        <>
          <SettingsSection id="app-lock-method" variant="card" title={t("appLock.method.title")}>
            <div className="flex items-center gap-3" data-testid="lock-current-method">
              <span className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center bg-primary/10">
                {state.method === "pin" ? (
                  <KeyRound className="w-4 h-4 text-primary" aria-hidden="true" />
                ) : (
                  <Fingerprint className="w-4 h-4 text-primary" aria-hidden="true" />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{t("appLock.method.current")}</p>
                <p className="text-sm font-bold">
                  {state.method === "pin" ? t("appLock.method.pin") : t("appLock.method.device")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {state.method === "pin" && (
                <button
                  type="button"
                  className="glass rounded-xl px-3 min-h-11 text-xs font-bold disabled:opacity-60"
                  onClick={() => void change("pin")}
                  disabled={busy}
                  data-testid="lock-change-pin"
                >
                  {t("appLock.changePin")}
                </button>
              )}
              <button
                type="button"
                className="glass rounded-xl px-3 min-h-11 text-xs font-bold disabled:opacity-60"
                onClick={() => void change()}
                disabled={busy}
                data-testid="lock-change-method"
              >
                {t("appLock.method.change")}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t("appLock.method.changeHint")}</p>

            {state.method === "pin" && (
              <div className="border-t border-border/40 pt-3 space-y-2">
                <SettingRow
                  id="zen-lock-bio"
                  label={t("appLock.bio.label")}
                  hint={
                    biometricReady(caps)
                      ? t("appLock.bio.hint")
                      : t(`appLock.bio.${caps.biometric}`)
                  }
                  control={
                    <Switch
                      labelledBy="zen-lock-bio"
                      on={state.biometricWithPin && biometricReady(caps)}
                      disabled={busy || (!state.biometricWithPin && !biometricReady(caps))}
                      onChange={(v) => void toggleBio(v)}
                    />
                  }
                />
                {(caps.biometric === "none_enrolled" || caps.biometric === "weak_only") && (
                  <button
                    type="button"
                    onClick={() => void openSecuritySettings()}
                    className="glass rounded-xl px-3 min-h-11 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Settings2 className="size-3.5" aria-hidden="true" />
                    {t("appLock.bio.openSettings")}
                  </button>
                )}
              </div>
            )}
          </SettingsSection>

          <LockNowSection />

          <SettingsSection id="app-lock-grace" variant="card" title={t("appLock.grace.title")}>
            <div role="radiogroup" aria-labelledby="more-sec-app-lock-grace" className="space-y-1">
              {GRACE_OPTIONS.map((g) => (
                <label
                  key={g}
                  className="flex items-center gap-3 min-h-11 px-2 rounded-xl hover:bg-primary/5 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="zen-lock-grace"
                    className="size-4 accent-[var(--primary)]"
                    checked={state.graceMs === g}
                    onChange={() => void setOption({ graceMs: g })}
                    data-testid={`lock-grace-${g}`}
                  />
                  <span className="text-sm">{t(graceKey(g))}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("appLock.grace.hint")}
            </p>
          </SettingsSection>

          <SettingsSection id="app-lock-privacy" variant="card" title={t("appLock.privacy.label")}>
            <SettingRow
              id="zen-lock-recents"
              label={t("appLock.privacy.label")}
              hint={
                caps.recentsMode === "preview"
                  ? t("appLock.privacy.hintPreview")
                  : t("appLock.privacy.hintSecure")
              }
              control={
                <Switch
                  labelledBy="zen-lock-recents"
                  on={state.hideInRecents}
                  onChange={(v) => void setOption({ hideInRecents: v })}
                />
              }
            />
            <PrivacyExtras state={state} />
          </SettingsSection>

          <AutoLockSection state={state} />

          {state.method === "pin" && (
            <RecoverySection
              state={state}
              caps={caps}
              busy={busy}
              confirmIdentity={confirmIdentity}
              account={account}
            />
          )}
        </>
      )}

      {setup && (
        <SetupSheet
          caps={caps}
          state={state}
          change={setup.change}
          initial={setup.method}
          recovery={recovery}
          onClose={() => setSetup(null)}
        />
      )}
      {confirm && (
        <ConfirmPinSheet
          state={state}
          caps={caps}
          onDone={(ok) => {
            confirm(ok);
            setConfirm(null);
          }}
        />
      )}
    </>
  );
}
