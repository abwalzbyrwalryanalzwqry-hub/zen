import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useT } from "@/lib/i18n";
import {
  FEATURE_DEFAULTS,
  FEATURE_KEYS,
  setFeatureFlag,
  type FeatureKey,
} from "@/lib/feature-flags";
import { toast } from "@/lib/toast";

const ROLLOUTS = [0, 10, 50, 100] as const;

/** مفاتيح الميزات لصاحب التطبيق (4.2): تشغيل/إيقاف ونسبة الطرح. الخادم يرفض غير المالك. */
export function FeatureFlagsCard() {
  const t = useT();
  const qc = useQueryClient();
  const { flags } = useFeatureFlags();
  const [busy, setBusy] = useState<FeatureKey | null>(null);

  const save = async (key: FeatureKey, enabled: boolean, rollout: number) => {
    setBusy(key);
    try {
      await setFeatureFlag(key, enabled, rollout);
      await qc.invalidateQueries({ queryKey: ["feature-flags"] });
      toast.success(t("flags.saved"));
    } catch {
      toast.error(t("flags.error"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label={t("flags.title")} className="glass rounded-3xl p-4 space-y-3">
      <div>
        <h2 className="text-sm font-bold">{t("flags.title")}</h2>
        <p className="text-[0.6875rem] text-muted-foreground">{t("flags.hint")}</p>
      </div>
      <ul className="space-y-3">
        {FEATURE_KEYS.map((key) => {
          const row = flags[key];
          const enabled = row?.enabled ?? FEATURE_DEFAULTS[key];
          const rollout = row?.rollout ?? 100;
          const label = t(`more.links.${key}.label`);
          return (
            <li key={key} className="space-y-1.5">
              <label className="flex items-center justify-between gap-3 text-xs min-h-11">
                <span className="font-medium">{label}</span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={enabled}
                  checked={enabled}
                  disabled={busy === key}
                  onChange={(e) => void save(key, e.target.checked, rollout)}
                  className="w-5 h-5 accent-primary"
                />
              </label>
              {enabled && (
                <div
                  role="radiogroup"
                  aria-label={t("flags.rollout", { name: label })}
                  className="flex gap-1.5"
                >
                  {ROLLOUTS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={rollout === r}
                      disabled={busy === key}
                      onClick={() => void save(key, true, r)}
                      className={`flex-1 min-h-11 rounded-xl text-[0.6875rem] font-bold tabular-nums ${
                        rollout === r ? "bg-primary text-primary-foreground" : "bg-secondary/60"
                      }`}
                    >
                      {r}%
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
