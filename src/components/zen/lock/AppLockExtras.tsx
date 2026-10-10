import { useState } from "react";
import { Link2, LockKeyhole } from "lucide-react";
import { SettingRow } from "@/components/zen/settings/SettingsShell";
import { SettingsSection } from "@/components/zen/more/SettingsSection";
import { Switch } from "@/components/zen/more/Switch";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import {
  IDLE_OPTIONS,
  accountLabel,
  idleKey,
  recoveryOptions,
  type LockCaps,
  type LockState,
} from "@/lib/app-lock-core";
import type { LockAccount, LockOptions } from "@/lib/app-lock-state";
import { bindRecoveryAccount, bridgeErrorCode, lockAppNow, setLockOptions } from "@/lib/app-lock";
import { RecoveryNote } from "./LockSetupSheets";

/**
 * أقسام إعدادات القفل الإضافية (1.29.0): «اقفل الآن»، والقفل التلقائي (الخمول وإطفاء الشاشة)، والخصوصية
 * (نص الإشعارات والمصحف دون فتح)، والاستعادة (قفل الجهاز والحساب المربوط). كل تغيير تحسمه الطبقة الأصلية؛
 * ما يُضعف الحماية (الاستعادة بقفل الجهاز، وربط حساب آخر) يُطلب له تأكيد الهوية أولاً.
 */
type Props = {
  state: LockState;
  caps: LockCaps;
  busy: boolean;
  confirmIdentity: () => Promise<boolean>;
  account: LockAccount | null;
};

async function save(o: LockOptions, fail: string): Promise<boolean> {
  try {
    await setLockOptions(o);
    return true;
  } catch (e) {
    if (bridgeErrorCode(e) !== "AUTH_REQUIRED") toast.error(fail);
    return false;
  }
}

export function LockNowSection() {
  const t = useT();
  return (
    <SettingsSection id="app-lock-now" variant="card" title={t("appLock.lockNow.label")}>
      <button
        type="button"
        onClick={() => void lockAppNow().catch(() => toast.error(t("appLock.setup.failed")))}
        className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2"
        data-testid="lock-now"
      >
        <LockKeyhole className="size-5" aria-hidden="true" />
        {t("appLock.lockNow.label")}
      </button>
      <p className="text-xs text-muted-foreground leading-relaxed">{t("appLock.lockNow.hint")}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{t("appLock.tile.hint")}</p>
    </SettingsSection>
  );
}

export function AutoLockSection({ state }: Pick<Props, "state">) {
  const t = useT();
  const fail = t("appLock.setup.failed");
  return (
    <SettingsSection id="app-lock-idle" variant="card" title={t("appLock.idle.title")}>
      <div role="radiogroup" aria-labelledby="more-sec-app-lock-idle" className="space-y-1">
        {IDLE_OPTIONS.map((g) => (
          <label
            key={g}
            className="flex items-center gap-3 min-h-11 px-2 rounded-xl hover:bg-primary/5 cursor-pointer"
          >
            <input
              type="radio"
              name="zen-lock-idle"
              className="size-4 accent-[var(--primary)]"
              checked={state.idleMs === g}
              onChange={() => void save({ idleMs: g }, fail)}
              data-testid={`lock-idle-${g}`}
            />
            <span className="text-sm">{t(idleKey(g))}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{t("appLock.idle.hint")}</p>
      <div className="border-t border-border/40 pt-3">
        <SettingRow
          id="zen-lock-screen-off"
          label={t("appLock.screenOff.label")}
          hint={t("appLock.screenOff.hint")}
          control={
            <Switch
              labelledBy="zen-lock-screen-off"
              on={state.lockOnScreenOff}
              onChange={(v) => void save({ lockOnScreenOff: v }, fail)}
            />
          }
        />
      </div>
    </SettingsSection>
  );
}

export function PrivacyExtras({ state }: Pick<Props, "state">) {
  const t = useT();
  const fail = t("appLock.setup.failed");
  const setPrivate = async (v: boolean) => {
    if (!(await save({ privateNotifications: v }, fail))) return;
    const { syncLockPushPrivacy } = await import("@/lib/app-lock-push");
    if ((await syncLockPushPrivacy()) === "failed") toast.info(t("appLock.notif.syncFailed"));
  };
  return (
    <>
      <SettingRow
        id="zen-lock-notif"
        label={t("appLock.notif.label")}
        hint={t("appLock.notif.hint")}
        control={
          <Switch
            labelledBy="zen-lock-notif"
            on={state.privateNotifications}
            onChange={(v) => void setPrivate(v)}
          />
        }
      />
      <SettingRow
        id="zen-lock-quran"
        label={t("appLock.quran.label")}
        hint={t("appLock.quran.hint")}
        control={
          <Switch
            labelledBy="zen-lock-quran"
            on={state.quranWhileLocked}
            onChange={(v) => void save({ quranWhileLocked: v }, fail)}
          />
        }
      />
    </>
  );
}

export function RecoverySection({ state, caps, busy, confirmIdentity, account }: Props) {
  const t = useT();
  const [working, setWorking] = useState(false);
  const fail = t("appLock.setup.failed");
  const recovery = recoveryOptions(caps, state);
  const bound = accountLabel(state.accountEmail);
  const mismatch = !!account && !!state.ownerId && state.ownerId !== account.userId;

  const toggleDevice = async (v: boolean) => {
    if (working) return;
    setWorking(true);
    try {
      // تفعيله يُضعف الحماية: تأكيد الهوية أولاً (والطبقة الأصلية ترفض بدونه).
      if (v && !(await confirmIdentity())) return;
      await save({ deviceRecovery: v }, fail);
    } finally {
      setWorking(false);
    }
  };

  const bind = async () => {
    if (working) return;
    setWorking(true);
    try {
      if (!(await confirmIdentity())) return;
      if ((await bindRecoveryAccount(true)) === "bound")
        toast.success(t("appLock.account.bound_done"));
      else toast.error(fail);
    } finally {
      setWorking(false);
    }
  };

  return (
    <SettingsSection id="app-lock-recovery" variant="card" title={t("appLock.recovery.title")}>
      <RecoveryNote recovery={recovery} />
      {caps.deviceSecure && (
        <SettingRow
          id="zen-lock-device-recovery"
          label={t("appLock.deviceRecovery.label")}
          hint={t("appLock.deviceRecovery.hint")}
          control={
            <Switch
              labelledBy="zen-lock-device-recovery"
              on={state.deviceRecovery}
              disabled={busy || working}
              onChange={(v) => void toggleDevice(v)}
            />
          }
        />
      )}
      <div className="border-t border-border/40 pt-3 space-y-2" data-testid="lock-account">
        <p className="text-sm font-bold">{t("appLock.account.title")}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {mismatch
            ? t("appLock.account.mismatch", { email: bound ?? "—" })
            : state.recoveryAccount
              ? bound
                ? t("appLock.account.bound", { email: bound })
                : t("appLock.recovery.account")
              : t("appLock.account.none")}
        </p>
        {mismatch && (
          <button
            type="button"
            onClick={() => void bind()}
            disabled={busy || working}
            className="glass rounded-xl px-3 min-h-11 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
            data-testid="lock-bind-account"
          >
            <Link2 className="size-3.5" aria-hidden="true" />
            {t("appLock.account.bind")}
          </button>
        )}
      </div>
    </SettingsSection>
  );
}
