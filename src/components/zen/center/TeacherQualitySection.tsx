import { useQuery } from "@tanstack/react-query";
import { UserCheck } from "lucide-react";
import { fetchTeacherQuality, needsAttention } from "@/lib/center-insights";
import { useT } from "@/lib/i18n";

/**
 * جودة الإدخال لكل معلّم (1.20.0، من بيانات المرحلة 2): ما أُغلق في يومه، والإغلاق المتأخر، والتعديلات بعد
 * الإغلاق، وتنبيهات المراقب، وملاحظات المشرف في العيّنة. مؤشّر للمتابعة لا تقييم للمعلّم.
 */
export function TeacherQualitySection({ centerId, days }: { centerId: string; days: number }) {
  const t = useT();
  const span = Math.max(7, Math.min(days, 90));
  const q = useQuery({
    queryKey: ["center-teacher-quality", centerId, span],
    queryFn: () => fetchTeacherQuality(centerId, span),
    retry: false,
    staleTime: 5 * 60_000,
  });
  if (!q.data?.teachers.length) return null;
  return (
    <section
      aria-labelledby="teacher-quality"
      className="glass-strong rounded-3xl p-4 space-y-2"
      data-testid="teacher-quality"
    >
      <h2
        id="teacher-quality"
        className="text-sm font-bold text-foreground flex items-center gap-1.5"
      >
        <UserCheck className="w-4 h-4 text-primary" aria-hidden="true" />
        {t("centerInsights.teachers.title", { n: q.data.days })}
      </h2>
      <p className="text-xs text-muted-foreground">{t("centerInsights.teachers.hint")}</p>
      <div className="space-y-1.5">
        {q.data.teachers.map((x) => {
          const flag = needsAttention(x);
          return (
            <div
              key={x.teacher_id}
              className="glass rounded-2xl px-3 py-2"
              data-teacher-quality={x.teacher_id}
            >
              <div className="flex items-center gap-2">
                <p className="flex-1 text-xs font-bold text-foreground truncate">{x.name}</p>
                {flag && (
                  <span className="text-[0.625rem] font-bold px-2 py-0.5 rounded-full bg-gold/15 text-gold-ink">
                    {t("centerInsights.teachers.review")}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-1 mt-1.5 text-center">
                <Mini label={t("centerInsights.teachers.records")} value={x.records} />
                <Mini
                  label={t("centerInsights.teachers.sameDay")}
                  value={x.same_day_rate == null ? "—" : `${x.same_day_rate}%`}
                />
                <Mini label={t("centerInsights.teachers.late")} value={x.late_closes} />
                <Mini label={t("centerInsights.teachers.edits")} value={x.edits_after_close} />
                <Mini
                  label={t("centerInsights.teachers.warnings")}
                  value={x.warnings + x.flagged}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-[0.6875rem] font-bold text-foreground tabular-nums">{value}</p>
      <p className="text-[0.625rem] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}
