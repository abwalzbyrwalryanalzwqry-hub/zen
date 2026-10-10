import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PushDeviceCard } from "@/components/zen/settings/PushDeviceCard";
import { SettingRow, SettingsShell } from "@/components/zen/settings/SettingsShell";
import { AutoSaveStatus } from "@/components/zen/settings/AutoSaveStatus";
import { SettingsSection } from "@/components/zen/more/SettingsSection";
import { Switch } from "@/components/zen/more/Switch";
import { QueryError } from "@/components/zen/QueryError";
import { useSession } from "@/hooks/useSession";
import { useHomeContext } from "@/hooks/useHomeContext";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useT, t as tStatic } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import {
  categoryOn,
  DEFAULT_PREFS,
  fetchPrefs,
  hhmm,
  PUSH_CATEGORIES,
  savePrefs,
  toggleCategory,
  type NotificationPrefs,
} from "@/lib/push";

export const Route = createFileRoute("/_authed/settings_/notifications")({
  head: () => ({ meta: [{ title: tStatic("meta.settingsNotifications") }] }),
  component: NotificationSettingsPage,
});

/**
 * التنبيهات والتذكيرات (تحليل «المزيد» §7.2): الفورية، وما يصلني، والتذكيرات، وساعات الهدوء. تُحفظ تلقائياً
 * (ARC-07)، ولا تُعرض ولا تُحفظ قبل تحميل القيم الحقيقية (SEC-03).
 */
function NotificationSettingsPage() {
  const t = useT();
  const qc = useQueryClient();
  const { userId, guest } = useSession();
  const { ctx, mode } = useHomeContext();
  const key = ["notification-prefs", userId] as const;
  const prefsQ = useQuery({
    queryKey: key,
    enabled: !!userId && !guest,
    queryFn: () => fetchPrefs(userId!),
    retry: 1,
  });
  const [draft, setDraft] = useState<NotificationPrefs | null>(null);
  const prefs: NotificationPrefs = draft ?? prefsQ.data ?? DEFAULT_PREFS;
  const status = useAutoSave(
    draft,
    savePrefs,
    (saved) => {
      qc.setQueryData(key, saved);
      setDraft((cur) => (cur === saved ? null : cur));
    },
    (e) =>
      toast.error(t("settings.autosave.failed", { reason: e instanceof Error ? e.message : "" })),
  );

  const showFamily = mode === "guardian" || ctx.children > 0;
  const cats = PUSH_CATEGORIES.filter((c) => c.key !== "family" || showFamily);
  const quiet = !!(prefs.quiet_start && prefs.quiet_end);
  const update = (p: NotificationPrefs) => setDraft(p);

  return (
    <SettingsShell
      title={t("more.links.settingsNotifications.label")}
      fallback="/more"
      trailing={<AutoSaveStatus status={status} />}
    >
      {guest ? (
        <div className="glass rounded-3xl p-4 space-y-3">
          <p className="text-sm text-foreground">{t("settings.guestNeedsAccount")}</p>
          <Link
            to="/auth/login"
            className="flex items-center justify-center min-h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-bold"
          >
            {t("settings.signIn")}
          </Link>
        </div>
      ) : prefsQ.isError ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive px-2">
            {t("settings.prefsLoadFailed")}
          </p>
          <QueryError compact onRetry={() => void prefsQ.refetch()} />
        </div>
      ) : !prefsQ.isSuccess ? (
        <div className="flex justify-center py-10" role="status" aria-label={t("common.loading")}>
          <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
        </div>
      ) : (
        <>
          <SettingsSection id="push" variant="card" title={t("settings.push.title")}>
            <PushDeviceCard />
            <div className="border-t border-border/60 pt-3">
              {/* كان العنوان «إيقاف الفورية» والمفتاح يعني التشغيل، فانعكس المعنى (IA-11). */}
              <SettingRow
                id="zen-push-all"
                label={t("settings.push.all")}
                hint={t("settings.push.allHint")}
                control={
                  <Switch
                    labelledBy="zen-push-all"
                    on={prefs.push_enabled}
                    onChange={(v) => update({ ...prefs, push_enabled: v })}
                  />
                }
              />
            </div>
          </SettingsSection>

          <SettingsSection id="cats" variant="card" title={t("settings.cats.title")}>
            {cats.map((c) => (
              <SettingRow
                key={c.key}
                id={`zen-cat-${c.key}`}
                label={t(`settings.cats.${c.key}.label`)}
                hint={t(`settings.cats.${c.key}.hint`)}
                control={
                  <Switch
                    labelledBy={`zen-cat-${c.key}`}
                    on={categoryOn(prefs, c.key)}
                    onChange={(v) => update(toggleCategory(prefs, c.key, v))}
                  />
                }
              />
            ))}
            <p className="text-xs text-muted-foreground">{t("settings.cats.footer")}</p>
          </SettingsSection>

          <SettingsSection id="reminders" variant="card" title={t("settings.reminders.title")}>
            <TimeRow
              id="wird"
              label={t("settings.cats.wird.label")}
              value={prefs.wird_time}
              onChange={(v) => update({ ...prefs, wird_time: v })}
            />
            <TimeRow
              id="muhasaba"
              label={t("settings.cats.muhasaba.label")}
              value={prefs.muhasaba_time}
              onChange={(v) => update({ ...prefs, muhasaba_time: v })}
            />
          </SettingsSection>

          <SettingsSection id="quiet" variant="card" title={t("settings.quiet.title")}>
            <SettingRow
              id="zen-quiet"
              label={t("settings.quiet.toggle")}
              control={
                <Switch
                  labelledBy="zen-quiet"
                  on={quiet}
                  onChange={(v) =>
                    update({
                      ...prefs,
                      quiet_start: v ? "22:00" : null,
                      quiet_end: v ? "06:00" : null,
                    })
                  }
                />
              }
            />
            {quiet && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground space-y-1">
                  <span className="block">{t("settings.quiet.from")}</span>
                  <input
                    type="time"
                    value={hhmm(prefs.quiet_start)}
                    onChange={(e) => update({ ...prefs, quiet_start: e.target.value || null })}
                    className="w-full min-h-11 rounded-xl bg-muted/60 px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <label className="text-xs text-muted-foreground space-y-1">
                  <span className="block">{t("settings.quiet.to")}</span>
                  <input
                    type="time"
                    value={hhmm(prefs.quiet_end)}
                    onChange={(e) => update({ ...prefs, quiet_end: e.target.value || null })}
                    className="w-full min-h-11 rounded-xl bg-muted/60 px-3 py-2 text-sm text-foreground"
                  />
                </label>
              </div>
            )}
            <p className="text-xs text-muted-foreground" dir="auto">
              {t("settings.quiet.tz", { tz: prefs.timezone })}
            </p>
          </SettingsSection>
        </>
      )}
    </SettingsShell>
  );
}

function TimeRow({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-3">
      <p id={`zen-time-${id}`} className="flex-1 text-sm font-bold text-foreground">
        {label}
      </p>
      <input
        type="time"
        aria-label={t("settings.reminders.timeOf", { label })}
        value={hhmm(value)}
        disabled={!value}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-h-11 rounded-xl bg-muted/60 px-3 py-2 text-sm text-foreground disabled:opacity-50"
      />
      <Switch
        labelledBy={`zen-time-${id}`}
        on={!!value}
        onChange={(v) => onChange(v ? (value ?? "20:00") : null)}
      />
    </div>
  );
}
