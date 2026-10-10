import { useEffect, useState } from "react";
import { Bug } from "lucide-react";
import { Switch } from "@/components/zen/more/Switch";
import { useT } from "@/lib/i18n";
import { crashReportingAvailable, getCrashConsent, setCrashConsent } from "@/lib/native-system";

/** تقارير الأعطال الأصلية (L7): معطّلة افتراضياً، وتُفعَّل بموافقة صريحة على هذا الجهاز. */
export function CrashReportSettings() {
  const t = useT();
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!crashReportingAvailable()) return;
    void getCrashConsent().then((v) => {
      setOn(v);
      setReady(true);
    });
  }, []);
  if (!ready) return null;
  const toggle = () => {
    const next = !on;
    setOn(next);
    void setCrashConsent(next).catch(() => setOn(!next));
  };
  return (
    <div className="glass-strong rounded-3xl p-4 flex items-center gap-3">
      <Bug className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
      <span id="zen-crash-label" className="flex-1 text-sm text-foreground">
        {t("crash.title")}
        <span className="block text-xs text-muted-foreground">{t("crash.hint")}</span>
      </span>
      <Switch on={on} labelledBy="zen-crash-label" onChange={() => toggle()} />
    </div>
  );
}
