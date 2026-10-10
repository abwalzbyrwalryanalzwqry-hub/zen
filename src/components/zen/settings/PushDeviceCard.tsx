import { useCallback, useEffect, useState } from "react";
import { BellRing, Loader2, Send, Settings2, Volume2 } from "lucide-react";
import { Switch } from "@/components/zen/more/Switch";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { disablePush, enablePush, pushDeviceState, sendTestPush } from "@/lib/push";
import { ANDROID_CHANNEL, type DeviceState } from "@/lib/notify/device";
import { openNotificationSettings } from "@/lib/native-system";

/**
 * إشعارات هذا الجهاز (1.16.1) في مكان واحد: الحالة الحقيقية (مفعّلة، موقوفة، الإذن مرفوض، قناة زِن
 * مطفأة في الجوال)، والمفتاح، و«الصوت والاهتزاز» في إعدادات الجوال (صوت الجوال الافتراضي على قناة واحدة)،
 * و«إرسال إشعار تجريبي» يمرّ بالسلسلة كاملة. تُعاد قراءة الحالة عند العودة من إعدادات الجوال.
 */
export function PushDeviceCard() {
  const t = useT();
  const [state, setState] = useState<DeviceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(() => {
    void pushDeviceState().then(setState);
  }, []);
  useEffect(() => {
    refresh();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        const err = await enablePush();
        if (err) toast.error(err);
      } else await disablePush();
    } catch (e) {
      toast.error(t("settings.autosave.failed", { reason: e instanceof Error ? e.message : "" }));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const err = await sendTestPush(t("settings.push.testTitle"), t("settings.push.testBody"));
      if (!err) toast.success(t("settings.push.testSent"));
      else toast.error(t(`settings.push.testError.${err}`));
    } finally {
      setTesting(false);
    }
  };

  const openSystem = async (channel?: string) => {
    if (!(await openNotificationSettings(channel)))
      toast.error(t("settings.push.noSystemSettings"));
  };

  const supported = state !== "unsupported";
  const on = state === "on";
  const needsSystem = state === "denied" || state === "blocked";
  const btn =
    "min-h-11 px-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <BellRing className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p id="zen-push-device" className="text-sm font-bold text-foreground">
            {t("settings.push.device")}
          </p>
          <p className="text-xs text-muted-foreground" role="status">
            {state === null ? t("common.loading") : t(`settings.push.state.${state}`)}
          </p>
        </div>
        {busy || state === null ? (
          <Loader2
            className="w-5 h-5 animate-spin text-primary"
            role="status"
            aria-label={t("settings.push.busy")}
          />
        ) : (
          <Switch
            label={t("settings.push.deviceLabel")}
            on={on}
            disabled={!supported || needsSystem}
            onChange={(v) => void toggle(v)}
          />
        )}
      </div>

      {needsSystem && (
        <button
          type="button"
          onClick={() => void openSystem()}
          className={`${btn} w-full gradient-primary text-primary-foreground`}
        >
          <Settings2 className="w-4 h-4" aria-hidden="true" />
          {t("settings.push.openSystem")}
        </button>
      )}

      {supported && (
        <div className="flex items-center gap-3 border-t border-border/60 pt-3">
          <Volume2 className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground">{t("settings.push.sound")}</p>
            <p className="text-xs text-muted-foreground">{t("settings.push.soundHint")}</p>
          </div>
          <button
            type="button"
            onClick={() => void openSystem(ANDROID_CHANNEL)}
            className={`${btn} bg-muted/70 text-foreground`}
          >
            {t("settings.push.change")}
          </button>
        </div>
      )}

      {on && (
        <button
          type="button"
          onClick={() => void test()}
          disabled={testing}
          className={`${btn} w-full bg-primary/10 text-primary`}
        >
          {testing ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="w-4 h-4" aria-hidden="true" />
          )}
          {t("settings.push.test")}
        </button>
      )}
    </div>
  );
}
