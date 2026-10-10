import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2 } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { PageHeader } from "@/components/zen/common/PageHeader";
import { EmptyState } from "@/components/zen/common/EmptyState";
import { QueryError } from "@/components/zen/QueryError";
import { ReportWizard } from "@/components/zen/reports/ReportWizard";
import { useSession } from "@/hooks/useSession";
import { useT, t as tt } from "@/lib/i18n";
import { listHalaqat } from "@/lib/zen-api";
import { localDayKey } from "@/lib/local-day";
import { useRegisterDict } from "@/lib/register-i18n";

/** التقارير: /teacher/reports?halaqa=&student= — معالج «إعداد التقرير» من بيانات السجل اليومي. */
export const Route = createFileRoute("/_authed/teacher_/reports")({
  head: () => ({ meta: [{ title: `${tt("dailyRecord.reports")} — Zen` }] }),
  validateSearch: (s: Record<string, unknown>): { halaqa?: string; student?: string } => ({
    halaqa: typeof s.halaqa === "string" && s.halaqa ? s.halaqa : undefined,
    student: typeof s.student === "string" && s.student ? s.student : undefined,
  }),
  component: ReportsScreen,
});

function ReportsScreen() {
  useRegisterDict();
  const t = useT();
  const { userId } = useSession();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const halaqat = useQuery({
    queryKey: ["register-halaqat", userId],
    enabled: !!userId,
    queryFn: () => listHalaqat(),
  });
  const mine = useMemo(
    () =>
      (halaqat.data ?? [])
        .filter((h) => h.teacher_id === userId)
        .concat((halaqat.data ?? []).filter((h) => h.teacher_id !== userId)),
    [halaqat.data, userId],
  );
  const halaqa = search.halaqa ?? mine[0]?.id ?? "";
  const today = localDayKey(new Date());

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <PageHeader
          title={t("dailyRecord.reports")}
          subtitle={mine.find((h) => h.id === halaqa)?.name}
          back="/teacher/register"
        />
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3">
          {halaqat.isPending ? (
            <div
              className="flex justify-center py-10"
              role="status"
              aria-label={t("common.loading")}
            >
              <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
            </div>
          ) : halaqat.isError ? (
            <QueryError onRetry={() => void halaqat.refetch()} />
          ) : !mine.length ? (
            <EmptyState
              icon={ClipboardList}
              title={t("dailyRecord.noHalaqat")}
              hint={t("dailyRecord.noHalaqatHint")}
            />
          ) : (
            <>
              {mine.length > 1 && (
                <div
                  role="radiogroup"
                  aria-label={t("dailyRecord.halaqa")}
                  className="flex gap-1.5 overflow-x-auto -mx-3 px-3"
                >
                  {mine.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      role="radio"
                      aria-checked={h.id === halaqa}
                      onClick={() => void navigate({ search: { halaqa: h.id }, replace: true })}
                      className={`min-h-11 shrink-0 rounded-full px-4 text-xs font-bold whitespace-nowrap ${
                        h.id === halaqa
                          ? "gradient-primary text-primary-foreground"
                          : "glass text-foreground"
                      }`}
                    >
                      {h.name}
                    </button>
                  ))}
                </div>
              )}
              <ReportWizard
                key={`${halaqa}:${search.student ?? ""}`}
                halaqa={halaqa}
                today={today}
                student={search.student}
              />
            </>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
}
