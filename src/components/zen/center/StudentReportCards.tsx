// تصدير تقرير الطالب وملخّص أسبوعه (M5: من CenterManagement.tsx دون تغيير السلوك؛ يُعاد تصديرهما منه).

import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import {
  daysAgo,
  getStudentReport,
  isoDate,
  type StudentReport,
  attendanceRate,
} from "@/lib/center";
import { exportExcel, exportPdf, studentReportDoc } from "@/lib/center-export";
import { preopenPrintWindow } from "@/lib/native-file";
import { useT } from "@/lib/i18n";
import { useAsync } from "@/hooks/use-async";

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** أزرار تصدير تقرير طالب لفترة (PDF وExcel). */
export function StudentReportExport({
  studentId,
  studentName,
  defaultDays = 30,
  range,
  title,
}: {
  studentId: string;
  studentName?: string;
  defaultDays?: number;
  /** فترة محدّدة مسبقاً (التقرير الشهري 11.2). */
  range?: { from: string; to: string } | null;
  title?: string;
}) {
  const t = useT();
  const [from, setFrom] = useState(range?.from ?? daysAgo(defaultDays));
  const [to, setTo] = useState(range?.to ?? isoDate(new Date()));
  // فترة جديدة من الأب تحلّ محل المختارة (أثناء العرض لا في أثر، M12).
  const rangeKey = range ? `${range.from}|${range.to}` : null;
  const [rangeFor, setRangeFor] = useState(rangeKey);
  if (rangeKey !== rangeFor) {
    setRangeFor(rangeKey);
    if (range) {
      setFrom(range.from);
      setTo(range.to);
    }
  }
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (kind: "pdf" | "xlsx") => {
    setBusy(kind);
    setErr(null);
    // تُفتح النافذة قبل الانتظار حتى لا يحجبها المتصفح.
    const win = kind === "pdf" ? preopenPrintWindow() : null;
    try {
      const report = await getStudentReport(studentId, from, to);
      const doc = studentReportDoc(report);
      if (kind === "pdf") await exportPdf(doc, win);
      else
        await exportExcel(
          doc,
          t("studentReport.fileName", {
            name: report.student?.name ?? studentName ?? t("studentReport.student"),
            from,
            to,
          }),
        );
    } catch (e) {
      win?.close();
      setErr(errText(e, t("studentReport.exportFailed")));
    }
    setBusy(null);
  };

  return (
    <div className={`glass rounded-2xl p-3 ${range ? "border border-primary/40" : ""}`}>
      <p className="text-xs font-bold text-foreground mb-2">{title ?? t("studentReport.title")}</p>
      <div className="flex gap-1.5 items-center mb-2">
        <label className="text-[0.625rem] text-muted-foreground">{t("studentReport.from")}</label>
        <input
          type="date"
          value={from}
          max={to}
          onChange={(e) => setFrom(e.target.value)}
          className="flex-1 glass rounded-lg px-2 py-1.5 text-[0.6875rem] outline-none"
        />
        <label className="text-[0.625rem] text-muted-foreground">{t("studentReport.to")}</label>
        <input
          type="date"
          value={to}
          min={from}
          onChange={(e) => setTo(e.target.value)}
          className="flex-1 glass rounded-lg px-2 py-1.5 text-[0.6875rem] outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => run("pdf")}
          disabled={!!busy}
          className="flex-1 py-2 rounded-xl glass-strong text-[0.6875rem] text-primary font-medium flex items-center justify-center gap-1.5"
        >
          {busy === "pdf" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileText className="w-3.5 h-3.5" />
          )}
          PDF
        </button>
        <button
          onClick={() => run("xlsx")}
          disabled={!!busy}
          className="flex-1 py-2 rounded-xl glass-strong text-[0.6875rem] text-primary font-medium flex items-center justify-center gap-1.5"
        >
          {busy === "xlsx" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileSpreadsheet className="w-3.5 h-3.5" />
          )}
          Excel
        </button>
      </div>
      {err && <p className="text-[0.625rem] text-destructive mt-1.5">{err}</p>}
    </div>
  );
}

/** ملخّص الأيام السبعة الماضية (يطابق إشعار التقرير الأسبوعي لولي الأمر). */
export function WeeklySummaryCard({ studentId }: { studentId: string }) {
  const t = useT();
  const q = useAsync(`weekly-summary:${studentId}`, () =>
    getStudentReport(studentId, daysAgo(6), isoDate(new Date())),
  );
  const r: StudentReport | null = q.data ?? null;
  const err = q.error ? errText(q.error, t("studentReport.summaryFailed")) : null;

  if (err) return <p className="text-[0.6875rem] text-destructive px-1">{err}</p>;
  if (!r) return null;
  const s = r.attendance_summary;
  const total = (s.present ?? 0) + (s.late ?? 0) + (s.absent ?? 0) + (s.excused ?? 0);
  const rate = attendanceRate(s);
  const scored = r.assessments.filter((a) => a.score != null);
  const avg = scored.length
    ? Math.round(scored.reduce((x, a) => x + (a.score ?? 0), 0) / scored.length)
    : null;
  const pending = r.assignments.filter((a) => a.status === "pending").length;
  const lines = [
    total > 0
      ? t("studentReport.attendance", {
          came: (s.present ?? 0) + (s.late ?? 0),
          total,
          rate: rate ?? 0,
        })
      : t("studentReport.noSessions"),
    t("studentReport.pages", {
      memorized: r.mushaf_summary.memorized_pages ?? 0,
      reviewed: r.mushaf_summary.reviewed_pages ?? 0,
    }),
    scored.length
      ? t("studentReport.recitations", { count: r.assessments.length, avg: avg ?? 0 })
      : t("studentReport.noRecitations"),
    r.exams.length ? t("studentReport.exams", { count: r.exams.length }) : null,
    pending ? t("studentReport.pendingAssignments", { count: pending }) : null,
  ].filter(Boolean) as string[];
  return (
    <div className="glass-strong rounded-3xl p-4">
      <p className="text-xs font-bold text-foreground mb-2">{t("studentReport.thisWeek")}</p>
      <ul className="space-y-1">
        {lines.map((l) => (
          <li key={l} className="text-[0.6875rem] text-muted-foreground">
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}
