import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { drillRows, drillValue, fetchDrilldown, type DrillMetric } from "@/lib/center-insights";
import { useT } from "@/lib/i18n";

/**
 * التعمّق في مؤشر من لوحة المركز (1.20.0): الطلاب وراء الرقم مرتّبين بما يفسّره. اللمس على طالب يختاره في
 * «تقرير طالب» أسفل اللوحة. نداء واحد للفترة يخدم كل المؤشرات.
 */
export function DrillSheet({
  centerId,
  days,
  metric,
  onClose,
  onPick,
}: {
  centerId: string;
  days: number;
  metric: DrillMetric | null;
  onClose: () => void;
  onPick: (studentId: string) => void;
}) {
  const t = useT();
  const q = useQuery({
    queryKey: ["center-drill", centerId, days],
    queryFn: () => fetchDrilldown(centerId, days),
    enabled: metric != null,
    staleTime: 60_000,
    retry: false,
  });
  const rows = useMemo(
    () => (metric && q.data ? drillRows(q.data.students, metric) : []),
    [metric, q.data],
  );
  return (
    <Sheet open={metric != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        title={metric ? t(`centerInsights.drill.${metric}.title`) : ""}
        description={metric ? t(`centerInsights.drill.${metric}.hint`, { n: days }) : undefined}
      >
        {q.isPending ? (
          <div className="flex justify-center py-8" role="status">
            <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
          </div>
        ) : q.isError ? (
          <p className="text-xs text-destructive py-6 text-center">
            {t("centerInsights.err.load")}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            {t("centerInsights.drill.empty")}
          </p>
        ) : (
          <ul className="space-y-1.5" data-testid="drill-list">
            {rows.map((r) => (
              <li key={r.student_id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(r.student_id);
                    onClose();
                  }}
                  className="w-full glass rounded-2xl px-3 py-2 flex items-center gap-2 text-start"
                  data-list-row
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-foreground truncate">
                      {r.name}
                    </span>
                    {r.halaqat && (
                      <span className="block text-[0.625rem] text-muted-foreground truncate">
                        {r.halaqat}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-black text-primary tabular-nums" dir="ltr">
                    {drillValue(r, metric ?? "students")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
