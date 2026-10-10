import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type Profile } from "@/lib/zen-api";
import { listMyHalaqaStudentIds, listTeacherExamResults } from "@/lib/exam/storage";
import {
  buildClassReport,
  MASTERY_ORDER,
  PERIOD_LABEL,
  periodStart,
  type ReportPeriod,
} from "@/lib/exam/report";
import { MASTERY_LABEL } from "@/lib/exam/types";
import { MASTERY_BG, percentColor } from "./exam-report/colors";
import { Stat, FamilyBars } from "./exam-report/parts";
import { StudentCard, Untested } from "./exam-report/StudentCard";

export function TeacherExamReport({ students }: { students: Profile[] }) {
  const [period, setPeriod] = useState<ReportPeriod>("30");
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["teacher-exam-report", period],
    staleTime: 30_000,
    queryFn: () => listTeacherExamResults(periodStart(period)),
  });

  // طلاب حلقات هذا المعلّم فقط. قاعدة البيانات لا تُرجع له نتائج غيرهم أصلاً،
  // وهذه القائمة لتحديد من «لم يختبر» منهم.
  const mine = useQuery({
    queryKey: ["my-halaqa-students"],
    staleTime: 5 * 60_000,
    queryFn: listMyHalaqaStudentIds,
  });

  const report = useMemo(() => buildClassReport(query.data ?? []), [query.data]);
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? "طالب";

  // طلاب حلقاته الذين لم يختبروا في الفترة — غيابهم معلومة للمعلّم أيضاً.
  const myIds = new Set(mine.data ?? []);
  const tested = new Set(report.students.map((s) => s.studentId));
  const untested = students.filter((s) => myIds.has(s.id) && !tested.has(s.id));
  const noHalaqa = mine.isSuccess && myIds.size === 0;
  const shown = onlyAttention ? report.students.filter((s) => s.attention.length) : report.students;

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5" role="group" aria-label="فترة التقرير">
        {(Object.keys(PERIOD_LABEL) as ReportPeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            aria-pressed={period === p}
            className={`flex-1 rounded-xl py-1.5 text-[0.625rem] font-bold transition-all ${
              period === p ? "bg-primary/15 text-primary" : "glass text-muted-foreground"
            }`}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-primary" aria-label="جارٍ تحميل التقرير" />
        </div>
      ) : query.isError ? (
        <div className="glass rounded-3xl p-4 text-center space-y-2">
          <p role="alert" className="text-xs text-destructive">
            {query.error instanceof Error ? query.error.message : "تعذّر تحميل التقرير."}
          </p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="text-[0.6875rem] text-primary underline"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : noHalaqa ? (
        <p className="text-center text-xs text-muted-foreground py-10 px-4 leading-relaxed">
          لا يوجد طلاب في حلقاتك بعد. يعرض التقرير نتائج طلاب الحلقات التي أنت معلّمها فقط.
        </p>
      ) : report.examCount === 0 ? (
        <>
          <p className="text-center text-xs text-muted-foreground py-10">
            لا توجد اختبارات مسلَّمة في هذه الفترة.
          </p>
          <Untested list={untested} />
        </>
      ) : (
        <>
          <ClassSummary report={report} />

          {report.families.length > 0 && (
            <section className="glass rounded-3xl p-4 space-y-2.5">
              <h3 className="text-xs font-bold text-foreground">أداء الحلقة حسب نوع السؤال</h3>
              <FamilyBars families={report.families} />
            </section>
          )}

          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-muted-foreground">
              الطلاب ({report.studentCount})
            </h3>
            <button
              type="button"
              onClick={() => setOnlyAttention((v) => !v)}
              aria-pressed={onlyAttention}
              disabled={report.attentionCount === 0}
              className={`text-[0.625rem] rounded-full px-2.5 py-1 font-bold disabled:opacity-60 ${
                onlyAttention ? "bg-orange-400/20 text-orange-400" : "glass text-muted-foreground"
              }`}
            >
              يحتاجون متابعة فقط
            </button>
          </div>

          {shown.map((s) => (
            <StudentCard
              key={s.studentId}
              report={s}
              name={nameOf(s.studentId)}
              open={open === s.studentId}
              onToggle={() => setOpen(open === s.studentId ? null : s.studentId)}
            />
          ))}

          {!onlyAttention && <Untested list={untested} />}

          {(query.data?.length ?? 0) >= 1000 && (
            <p className="text-center text-[0.625rem] text-muted-foreground">
              يعرض التقرير أحدث 1000 نتيجة. اختر فترة أقصر لتقرير أدق.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ─────────── ملخّص الحلقة ─────────── */

function ClassSummary({ report }: { report: ReturnType<typeof buildClassReport> }) {
  const totalMastery = MASTERY_ORDER.reduce((n, m) => n + report.mastery[m], 0);
  return (
    <section className="glass rounded-3xl p-4 space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        <Stat label="طالباً" value={String(report.studentCount)} />
        <Stat label="اختباراً" value={String(report.examCount)} />
        <Stat
          label="المتوسط"
          value={`${report.averagePercentage}%`}
          className={percentColor(report.averagePercentage)}
        />
        <Stat
          label="للمتابعة"
          value={String(report.attentionCount)}
          className={report.attentionCount ? "text-orange-400" : "text-foreground"}
        />
      </div>

      {totalMastery > 0 && (
        <div className="space-y-1.5">
          <div
            className="flex h-2 rounded-full overflow-hidden bg-muted/30"
            role="img"
            aria-label={MASTERY_ORDER.map((m) => `${MASTERY_LABEL[m]} ${report.mastery[m]}`).join(
              "، ",
            )}
          >
            {MASTERY_ORDER.map((m) =>
              report.mastery[m] ? (
                <div
                  key={m}
                  className={MASTERY_BG[m]}
                  style={{ width: `${(report.mastery[m] / totalMastery) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {MASTERY_ORDER.map((m) => (
              <span
                key={m}
                className="flex items-center gap-1 text-[0.625rem] text-muted-foreground"
              >
                <span className={`w-2 h-2 rounded-full ${MASTERY_BG[m]}`} />
                {MASTERY_LABEL[m]} {report.mastery[m]}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
