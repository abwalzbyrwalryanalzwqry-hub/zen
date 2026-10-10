import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";
import { fetchCenterQuality } from "@/lib/record-audit";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

/**
 * جودة الإدخال لكل حلقة (1.18.0، المرحلة 2): أيام مسجّلة، وتعديلات بعد الإغلاق، وأيام أُغلقت بعد منتصف ليلها،
 * وتنبيهات المراقب. مؤشّر للمتابعة لا حكم؛ كل صف يفتح تبويب «التدقيق» في سجل الحلقة.
 */
export function RecordQualitySection({ centerId }: { centerId: string }) {
  usePagesDict();
  const t = useT();
  const q = useQuery({
    queryKey: ["center-record-quality", centerId],
    queryFn: () => fetchCenterQuality(centerId, 30),
    retry: false,
    staleTime: 5 * 60_000,
  });
  if (!q.data?.halaqat.length) return null;
  return (
    <section
      aria-labelledby="record-quality"
      className="glass-strong rounded-3xl p-4 space-y-2"
      data-testid="record-quality"
    >
      <h2
        id="record-quality"
        className="text-sm font-bold text-foreground flex items-center gap-1.5"
      >
        <ShieldCheck className="w-4 h-4 text-primary" aria-hidden="true" />
        {t("dailyRecord.audit.quality.title", { n: q.data.days })}
      </h2>
      <p className="text-xs text-muted-foreground">{t("dailyRecord.audit.quality.hint")}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-start font-medium py-1">
                {t("dailyRecord.audit.quality.halaqa")}
              </th>
              <th className="font-medium">{t("dailyRecord.audit.quality.records")}</th>
              <th className="font-medium">{t("dailyRecord.audit.quality.edits")}</th>
              <th className="font-medium">{t("dailyRecord.audit.quality.late")}</th>
              <th className="font-medium">{t("dailyRecord.audit.quality.warnings")}</th>
            </tr>
          </thead>
          <tbody>
            {q.data.halaqat.map((h) => (
              <tr
                key={h.halaqa_id}
                className="border-t border-border/40"
                data-quality-halaqa={h.halaqa_id}
              >
                <td className="py-1.5 max-w-[9rem]">
                  <Link
                    to="/teacher/register"
                    search={{ halaqa: h.halaqa_id, view: "audit" }}
                    className="font-bold text-primary block truncate"
                  >
                    {h.name}
                  </Link>
                  {h.teacher_name && (
                    <span className="text-muted-foreground block truncate">{h.teacher_name}</span>
                  )}
                </td>
                <td className="text-center tabular-nums">{h.records}</td>
                <td
                  className={`text-center tabular-nums ${h.edits_after_close ? "font-bold text-gold-ink" : ""}`}
                >
                  {h.edits_after_close}
                </td>
                <td
                  className={`text-center tabular-nums ${h.late_closes ? "font-bold text-gold-ink" : ""}`}
                >
                  {h.late_closes}
                </td>
                <td
                  className={`text-center tabular-nums ${h.warnings ? "font-bold text-gold-ink" : ""}`}
                >
                  {h.warnings}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
