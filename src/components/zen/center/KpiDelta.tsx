import { delta, deltaLabel } from "@/lib/center-insights";
import { useT } from "@/lib/i18n";

/**
 * سهم التغيّر عن الفترة السابقة تحت المؤشر (1.20.0): أخضر للتحسّن وأحمر للتراجع، ورمادي بلا تغيّر.
 * `higherIsBetter = false` لمؤشر مثل «يحتاجون متابعة».
 */
export function KpiDelta({
  current,
  previous,
  kind = "count",
  higherIsBetter = true,
}: {
  current: number | null | undefined;
  previous: number | null | undefined;
  kind?: "count" | "rate";
  higherIsBetter?: boolean;
}) {
  const t = useT();
  const d = delta(current, previous, kind, higherIsBetter);
  if (!d) return null;
  const tone =
    d.good == null ? "text-muted-foreground" : d.good ? "text-primary" : "text-destructive";
  return (
    <span
      className={`block text-[0.625rem] font-bold tabular-nums ${tone}`}
      title={t("centerInsights.delta.vsPrevious")}
      data-testid="kpi-delta"
    >
      {deltaLabel(d, kind)}
    </span>
  );
}
