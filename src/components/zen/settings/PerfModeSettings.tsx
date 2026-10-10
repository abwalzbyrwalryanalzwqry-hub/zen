import { useState } from "react";
import { Gauge } from "lucide-react";
import { SettingsSection } from "@/components/zen/more/SettingsSection";
import { useT } from "@/lib/i18n";
import {
  PERF_PREFERENCES,
  deviceIsLowEnd,
  getPerfPreference,
  isPerfModeActive,
  setPerfPreference,
  type PerfPreference,
} from "@/lib/perf-mode";

/**
 * «وضع الأداء» (1.17.0): تلقائي على الجهاز الضعيف، أو مفعّل/متوقف باختيار المستخدم. يُبطل التمويه الخلفي
 * فيصبح التمرير أنعم على الأجهزة الضعيفة (src/lib/perf-mode.ts).
 */
export function PerfModeSettings() {
  const t = useT();
  const [pref, setPref] = useState<PerfPreference>(getPerfPreference);
  const [active, setActive] = useState(() => isPerfModeActive());
  const lowEnd = deviceIsLowEnd();
  return (
    <SettingsSection id="performance" variant="card" title={t("settings.display.perf.title")}>
      <div className="flex items-start gap-3">
        <Gauge className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <p id="zen-perf-label" className="flex-1 text-xs text-muted-foreground leading-relaxed">
          {t("settings.display.perf.hint")}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="zen-perf-label"
        className="grid grid-cols-3 gap-1.5"
        data-testid="perf-mode"
      >
        {PERF_PREFERENCES.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={pref === p}
            onClick={() => {
              setPref(p);
              setActive(setPerfPreference(p));
            }}
            className={`rounded-xl min-h-11 py-2 text-xs font-semibold ${
              pref === p ? "bg-primary text-primary-foreground" : "glass text-foreground"
            }`}
          >
            {t(`settings.display.perf.${p}`)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {active ? t("settings.display.perf.stateOn") : t("settings.display.perf.stateOff")}
        {pref === "auto" && lowEnd ? ` ${t("settings.display.perf.detected")}` : ""}
      </p>
    </SettingsSection>
  );
}
