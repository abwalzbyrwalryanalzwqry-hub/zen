import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";
import { CenterChatSettings } from "@/components/zen/CenterChatSettings";
import { lazy, Suspense, useState } from "react";
import {
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Loader2,
  Medal,
  Users,
} from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { BottomNav } from "@/components/zen/BottomNav";
import { StudentReportExport } from "@/components/zen/CenterManagement";
import {
  RISK_LABEL,
  attendanceRate,
  getCenterDashboard,
  getCenterKpis,
  listCenterStudents,
  slotLabel,
  type CenterDashboard,
  type CenterKpis,
} from "@/lib/center";
import { CenterKpisSection } from "@/components/zen/center/CenterKpisSection";
import { RecordQualitySection } from "@/components/zen/center/RecordQualitySection";
import { CenterSimpleModeSetting } from "@/components/zen/center/CenterSimpleModeSetting";
import { KpiDelta } from "@/components/zen/center/KpiDelta";
import { DrillSheet } from "@/components/zen/center/DrillSheet";
import { TeacherQualitySection } from "@/components/zen/center/TeacherQualitySection";
import { CenterInsightSettings } from "@/components/zen/center/CenterInsightSettings";
import { CenterFeesLink } from "@/components/zen/center/CenterFeesLink";
import { fetchPeriodCompare, type DrillMetric, type PeriodCompare } from "@/lib/center-insights";
import { usePagesDict } from "@/lib/pages-i18n";
import { centerDashboardDoc, exportExcel, exportPdf } from "@/lib/center-export";
import { useAsync } from "@/hooks/use-async";

const WeeklyAttendanceChart = lazy(() => import("@/components/zen/center/WeeklyAttendanceChart"));

export const Route = createFileRoute("/_authed/center/$centerId")({
  head: () => ({ meta: [{ title: "لوحة المركز — Zen" }] }),
  component: CenterDashboardScreen,
});

const PERIODS = [7, 30, 90] as const;

const NO_STUDENTS: { student_id: string; name: string; halaqat: string }[] = [];

function CenterDashboardScreen() {
  usePagesDict();
  const tr = useT();
  const { centerId } = Route.useParams();
  const [days, setDays] = useState<number>(30);
  const dashQ = useAsync(`center-dash:${centerId}:${days}`, () =>
    getCenterDashboard(centerId, days),
  );
  // تغيير الفترة يبقي اللوحة السابقة ظاهرة حتى تصل الجديدة.
  const data: CenterDashboard | null = dashQ.latest ?? null;
  const loading = dashQ.loading;
  const err = dashQ.error
    ? dashQ.error instanceof Error
      ? dashQ.error.message
      : "تعذّر التحميل"
    : null;
  const studentsQ = useAsync(`center-students:${centerId}`, () =>
    listCenterStudents(centerId).catch(
      (): { student_id: string; name: string; halaqat: string }[] => [],
    ),
  );
  const students = studentsQ.data ?? NO_STUDENTS;
  const [pick, setPick] = useState<string>("");
  const [xlsBusy, setXlsBusy] = useState(false);
  const kpisQ = useAsync(`center-kpis:${centerId}`, () =>
    getCenterKpis(centerId).catch((): CenterKpis | null => null),
  );
  const kpis: CenterKpis | null = kpisQ.data ?? null;
  // 1.20.0: المقارنة بالفترة السابقة (أسهم التغيّر) والتعمّق في المؤشر.
  const cmpQ = useAsync(`center-cmp:${centerId}:${days}`, () =>
    fetchPeriodCompare(centerId, days).catch((): PeriodCompare | null => null),
  );
  const cmp = cmpQ.latest ?? null;
  const [drill, setDrill] = useState<DrillMetric | null>(null);
  const jump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const pickStudent = (id: string) => {
    setPick(id);
    setTimeout(() => jump("center-student-report"), 50);
  };

  const t = data?.totals;
  const picked = students.find((s) => s.student_id === pick);

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/centers" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-foreground truncate">
              {data?.center?.name ?? "لوحة المركز"}
            </h1>
            <p className="text-[0.6875rem] text-muted-foreground">
              {data?.center?.city ?? ""}
              {data ? ` · آخر ${data.period_days} يوماً` : ""}
            </p>
          </div>
          {data && !data.can_manage && (
            <span
              className="shrink-0 rounded-full glass px-2.5 py-1 text-[0.625rem] font-bold text-muted-foreground"
              title="مشرف تعليمي: تقرأ اللوحة والتقارير وتصدر الشهائد"
            >
              قراءة فقط
            </span>
          )}
        </header>

        <div className="px-5 flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setDays(p)}
              className={`flex-1 py-1.5 rounded-xl text-[0.6875rem] font-medium ${
                days === p ? "bg-primary text-white" : "glass text-foreground"
              }`}
            >
              {p} يوماً
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-3 mt-3 pb-4 space-y-3">
          {loading && !data ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : err ? (
            <p className="text-center text-xs text-destructive py-10">{err}</p>
          ) : data && t ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Kpi label="الطلاب" value={t.students} onClick={() => setDrill("students")} />
                <Kpi label="الحلقات" value={t.halaqat} onClick={() => jump("center-halaqat")} />
                <Kpi label="المعلّمون" value={t.teachers} onClick={() => jump("center-teachers")} />
                <Kpi
                  label="نسبة الحضور"
                  value={t.attendance_rate == null ? "—" : `${t.attendance_rate}%`}
                  onClick={() => setDrill("attendance")}
                  extra={
                    cmp && (
                      <KpiDelta
                        current={cmp.current.attendance_rate}
                        previous={cmp.previous.attendance_rate}
                        kind="rate"
                      />
                    )
                  }
                />
                <Kpi
                  label="صفحات محفوظة"
                  value={t.pages_memorized}
                  onClick={() => setDrill("pages")}
                  extra={
                    cmp && (
                      <KpiDelta
                        current={cmp.current.pages_memorized}
                        previous={cmp.previous.pages_memorized}
                      />
                    )
                  }
                />
                <Kpi
                  label="متوسط التسميع"
                  value={t.avg_score ?? "—"}
                  onClick={() => setDrill("score")}
                  extra={
                    cmp && (
                      <KpiDelta
                        current={cmp.current.avg_score}
                        previous={cmp.previous.avg_score}
                        kind="rate"
                      />
                    )
                  }
                />
                <Kpi
                  label="تسميعات"
                  value={t.assessments}
                  onClick={() => setDrill("assessments")}
                  extra={
                    cmp && (
                      <KpiDelta
                        current={cmp.current.assessments}
                        previous={cmp.previous.assessments}
                      />
                    )
                  }
                />
                <Kpi
                  label="متوسط الاختبارات"
                  value={t.avg_exam == null ? "—" : `${t.avg_exam}%`}
                  onClick={() => setDrill("exam")}
                  extra={
                    cmp && (
                      <KpiDelta
                        current={cmp.current.avg_exam}
                        previous={cmp.previous.avg_exam}
                        kind="rate"
                      />
                    )
                  }
                />
                <Kpi
                  label="يحتاجون متابعة"
                  value={t.at_risk}
                  warn={t.at_risk > 0}
                  onClick={() => jump("center-at-risk")}
                />
              </div>
              <p className="text-[0.625rem] text-muted-foreground text-center -mt-1">
                {tr("centerInsights.delta.legend", { n: days })}
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => void exportPdf(centerDashboardDoc(data, kpis))}
                  className="flex-1 py-2 rounded-xl glass-strong text-[0.6875rem] text-primary font-medium flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" /> تقرير PDF
                </button>
                <button
                  disabled={xlsBusy}
                  onClick={async () => {
                    setXlsBusy(true);
                    try {
                      await exportExcel(
                        centerDashboardDoc(data, kpis),
                        `تقرير-${data.center?.name ?? "المركز"}-${data.period_days}يوم`,
                      );
                    } finally {
                      setXlsBusy(false);
                    }
                  }}
                  className="flex-1 py-2 rounded-xl glass-strong text-[0.6875rem] text-primary font-medium flex items-center justify-center gap-1.5"
                >
                  {xlsBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  )}
                  Excel
                </button>
              </div>
              {/* استوديو الشهائد من لوحة المركز: الإحصاءات والإصدار والهوية لهذا المركز. */}
              <Link
                to="/certificates"
                search={{ center: centerId }}
                className="w-full py-2.5 rounded-xl glass-strong text-xs text-primary font-bold flex items-center justify-center gap-1.5"
              >
                <Medal className="w-4 h-4" aria-hidden="true" />{" "}
                {tr("more.links.certificates.label")}
              </Link>
              <CenterFeesLink centerId={centerId} />

              {kpis && <CenterKpisSection kpis={kpis} />}
              <RecordQualitySection centerId={centerId} />
              <TeacherQualitySection centerId={centerId} days={days} />

              <Section title="الحضور أسبوعياً">
                {data.weekly.length === 0 ? (
                  <Empty text="لا سجلات حضور في هذه الفترة." />
                ) : (
                  <div className="h-40" dir="ltr">
                    <Suspense
                      fallback={<div className="h-full animate-pulse rounded-xl bg-muted" />}
                    >
                      <WeeklyAttendanceChart weekly={data.weekly} />
                    </Suspense>
                  </div>
                )}
              </Section>

              <Section id="center-at-risk" title="يحتاجون متابعة" icon={AlertTriangle}>
                {data.at_risk.length === 0 ? (
                  <Empty text="لا يوجد طلاب يحتاجون متابعة خاصة." />
                ) : (
                  data.at_risk.map((s) => (
                    <div key={s.id} className="glass rounded-2xl px-3 py-2">
                      <div className="flex items-center gap-2">
                        <p className="flex-1 text-xs font-bold text-foreground truncate">
                          {s.name}
                        </p>
                        <span className="text-[0.625rem] text-muted-foreground truncate max-w-[45%]">
                          {s.halaqat}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.reasons.map((r) => (
                          <span
                            key={r}
                            className="text-[0.625rem] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive"
                          >
                            {RISK_LABEL[r] ?? r}
                          </span>
                        ))}
                      </div>
                      <p className="text-[0.625rem] text-muted-foreground mt-1">
                        الحضور {s.attendance_rate == null ? "—" : `${s.attendance_rate}%`} · التسميع{" "}
                        {s.avg_score ?? "—"} · آخر نشاط {s.last_activity ?? "—"}
                      </p>
                    </div>
                  ))
                )}
              </Section>

              <Section id="center-halaqat" title="الحلقات" icon={GraduationCap}>
                {data.halaqat.length === 0 ? (
                  <Empty text="لا حلقات في هذا المركز." />
                ) : (
                  data.halaqat.map((h) => {
                    const rate = attendanceRate(h);
                    return (
                      <div key={h.id} className="glass rounded-2xl px-3 py-2">
                        <div className="flex items-center gap-2">
                          <p className="flex-1 text-xs font-bold text-foreground truncate">
                            {h.name}
                          </p>
                          <span className="text-[0.625rem] text-muted-foreground">
                            {h.students} طالب
                          </span>
                        </div>
                        <p className="text-[0.625rem] text-muted-foreground">
                          {h.teacher_name ? `المعلّم: ${h.teacher_name}` : "بلا معلّم"}
                          {h.slots.length ? ` · ${h.slots.map(slotLabel).join("، ")}` : ""}
                        </p>
                        <div className="grid grid-cols-4 gap-1 mt-1.5 text-center">
                          <Mini label="الحضور" value={rate == null ? "—" : `${rate}%`} />
                          <Mini label="صفحات" value={h.pages_memorized} />
                          <Mini label="التسميع" value={h.avg_score ?? "—"} />
                          <Mini
                            label="الاختبارات"
                            value={h.avg_exam == null ? "—" : `${h.avg_exam}%`}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </Section>

              <Section id="center-teachers" title="المعلّمون" icon={Users}>
                {data.teachers.length === 0 ? (
                  <Empty text="لا معلّمين بعد." />
                ) : (
                  data.teachers.map((x) => (
                    <div key={x.id} className="glass rounded-2xl px-3 py-2">
                      <div className="flex items-center gap-2">
                        <p className="flex-1 text-xs font-bold text-foreground truncate">
                          {x.name ?? "معلّم"}
                        </p>
                        <span className="text-[0.625rem] text-muted-foreground">
                          آخر نشاط {x.last_activity ?? "—"}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 mt-1.5 text-center">
                        <Mini label="حلقات" value={x.halaqat} />
                        <Mini label="طلاب" value={x.students} />
                        <Mini label="حضور مسجّل" value={x.attendance_marked} />
                        <Mini label="تقييمات" value={x.assessments} />
                      </div>
                    </div>
                  ))
                )}
              </Section>

              <Section id="center-student-report" title="تقرير طالب">
                {students.length === 0 ? (
                  <Empty text="لا طلاب في المركز." />
                ) : (
                  <>
                    <select
                      value={pick}
                      onChange={(e) => setPick(e.target.value)}
                      className="w-full glass rounded-xl px-3 py-2 text-xs outline-none"
                    >
                      <option value="">اختر طالباً</option>
                      {students.map((s) => (
                        <option key={s.student_id} value={s.student_id}>
                          {s.name} — {s.halaqat}
                        </option>
                      ))}
                    </select>
                    {picked && (
                      <StudentReportExport
                        key={picked.student_id}
                        studentId={picked.student_id}
                        studentName={picked.name}
                      />
                    )}
                  </>
                )}
              </Section>

              <CenterChatSettings centerId={centerId} />
              <CenterSimpleModeSetting centerId={centerId} />
              <CenterInsightSettings centerId={centerId} />
              <DrillSheet
                centerId={centerId}
                days={days}
                metric={drill}
                onClose={() => setDrill(null)}
                onPick={pickStudent}
              />

              <p className="text-[0.625rem] text-muted-foreground text-center px-4 leading-relaxed">
                لا تعرض اللوحة المحاسبة الشخصية ولا المحادثات ولا التسجيلات ولا أرقام الهواتف.
              </p>
            </>
          ) : null}
        </div>

        <BottomNav />
      </div>
    </PhoneFrame>
  );
}

function Kpi({
  label,
  value,
  warn,
  extra,
  onClick,
}: {
  label: string;
  value: number | string;
  warn?: boolean;
  extra?: React.ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className={`text-lg font-black ${warn ? "text-destructive" : "text-primary"}`}>{value}</p>
      <p className="text-[0.625rem] text-muted-foreground">{label}</p>
      {extra}
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="glass-strong rounded-2xl p-2.5 text-center active:scale-[0.98] transition-transform"
      data-kpi
    >
      {body}
    </button>
  ) : (
    <div className="glass-strong rounded-2xl p-2.5 text-center">{body}</div>
  );
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-[0.6875rem] font-bold text-foreground">{value}</p>
      <p className="text-[0.625rem] text-muted-foreground">{label}</p>
    </div>
  );
}

function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  id?: string;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="glass-strong rounded-3xl p-4 space-y-2 scroll-mt-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-primary" />}
        <p className="text-sm font-bold text-foreground">{title}</p>
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-[0.6875rem] text-muted-foreground">{text}</p>;
}
