import { LayoutList } from "lucide-react";
import { SettingsSection } from "@/components/zen/more/SettingsSection";
import { useHomeContext } from "@/hooks/useHomeContext";
import { useT } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";
import {
  SIMPLE_PREFERENCES,
  resolveSimpleMode,
  setSimplePreference,
  useSimplePreference,
} from "@/lib/simple-mode";

/**
 * «الوضع المبسّط» للمعلّم (1.19.0): تلقائي (يتبع إعداد المركز)، أو مفعّل، أو متوقف. يظهر للمعلّم وحده.
 */
export function SimpleModeSettings() {
  usePagesDict();
  const t = useT();
  const { ctx, mode } = useHomeContext();
  const pref = useSimplePreference();
  if (mode !== "teacher") return null;
  const active = resolveSimpleMode(pref, ctx.center_simple_mode);
  return (
    <SettingsSection id="simple-mode" variant="card" title={t("settings.display.simple.title")}>
      <div className="flex items-start gap-3">
        <LayoutList className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <p id="zen-simple-label" className="flex-1 text-xs text-muted-foreground leading-relaxed">
          {t("settings.display.simple.hint")}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="zen-simple-label"
        className="grid grid-cols-3 gap-1.5"
        data-testid="simple-mode"
      >
        {SIMPLE_PREFERENCES.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={pref === p}
            onClick={() => setSimplePreference(p)}
            className={`rounded-xl min-h-11 py-2 text-xs font-semibold ${
              pref === p ? "bg-primary text-primary-foreground" : "glass text-foreground"
            }`}
          >
            {t(`settings.display.perf.${p}`)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {active ? t("settings.display.simple.stateOn") : t("settings.display.simple.stateOff")}
        {pref === "auto" && ctx.center_simple_mode
          ? ` ${t("settings.display.simple.byCenter")}`
          : ""}
      </p>
    </SettingsSection>
  );
}
