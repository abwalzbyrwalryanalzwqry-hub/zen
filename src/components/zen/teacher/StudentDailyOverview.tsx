import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { useT } from "@/lib/i18n";
import { gradeKeyOf5, gradeLabel } from "@/lib/grading";
import { fetchStudentDailyOverview } from "@/lib/daily-record-api";
import { EVAL_CRITERIA } from "@/lib/daily-record";
import { segmentsText } from "@/lib/daily-record-text";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

/**
 * بيانات السجل اليومي في ملف الطالب القائم (لا ملف جديد): حضور آخر 30 يوماً، وآخر حفظ ومراجعة،
 * وآخر تقييم، وآخر ملاحظات المعلّم. من student_daily_overview (معلّمه أو الطالب نفسه).
 */
export function StudentDailyOverview({ studentId }: { studentId: string }) {
  const t = useT();
  const q = useQuery({
    queryKey: ["student-daily-overview", studentId],
    queryFn: () => fetchStudentDailyOverview(studentId),
  });
  const d = q.data;
  if (q.isError || !d) return null;
  const att = d.attendance;
  const ev = d.last_evaluation;
  return (
    <section
      className="glass-strong rounded-3xl p-4 space-y-2"
      aria-label={t("dailyRecord.overview.title")}
    >
      <h2 className="text-xs font-bold text-foreground flex items-center gap-1.5">
        <ClipboardList className="w-4 h-4 text-primary" aria-hidden="true" />
        {t("dailyRecord.overview.title")}
      </h2>
      <p className="text-xs text-muted-foreground">
        {t("dailyRecord.overview.attendance30", {
          present: att.present,
          late: att.late,
          absent: att.absent,
          excused: att.excused,
        })}
      </p>
      <p className="text-xs text-foreground">
        {t("dailyRecord.card.lastMemorize")}:{" "}
        {d.last_memorize ? segmentsText([d.last_memorize]) : t("dailyRecord.card.none")}
      </p>
      <p className="text-xs text-foreground">
        {t("dailyRecord.card.lastReview")}:{" "}
        {d.last_review ? segmentsText([d.last_review]) : t("dailyRecord.card.none")}
      </p>
      {ev && (
        <p className="text-xs text-foreground">
          {t("dailyRecord.overview.lastEvaluation", { date: ev.session_date })}:{" "}
          {EVAL_CRITERIA.filter((c) => ev[c] != null)
            .map((c) => `${t(`dailyRecord.eval.${c}`)} ${gradeLabel(gradeKeyOf5(ev[c] as number))}`)
            .join(" · ")}
        </p>
      )}
      {d.notes.length > 0 && (
        <ul className="space-y-1" aria-label={t("dailyRecord.overview.notes")}>
          {d.notes.map((n) => (
            <li key={n.session_date} className="text-xs text-muted-foreground">
              <span className="tabular-nums">{n.session_date}</span> — {n.note}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
