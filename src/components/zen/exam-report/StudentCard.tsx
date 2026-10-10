// بطاقة الطالب في تقرير الاختبارات وتفاصيلها (M5: من TeacherExamReport.tsx دون تغيير السلوك).

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ClipboardCheck,
  Loader2,
  Minus,
  Repeat,
  Target,
  TrendingDown,
  TrendingUp,
  UserX,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { colorFor, initialOf, type Profile } from "@/lib/zen-api";
import { sendErrorsToReview } from "@/lib/exam/storage";
import {
  ATTENTION_LABEL,
  countExams,
  formatDuration,
  MASTERY_ORDER,
  type StudentExamReport,
  type Trend,
} from "@/lib/exam/report";
import {
  DIFFICULTY_LABEL,
  MASTERY_LABEL,
  type Difficulty,
  type MasteryLevel,
} from "@/lib/exam/types";
import { localDayOf } from "@/lib/local-day";
import { MASTERY_TEXT, percentColor } from "./colors";
import { Stat, FamilyBars } from "./parts";
import { useT } from "@/lib/i18n";

/* ─────────── بطاقة الطالب ─────────── */

function TrendBadge({ trend, delta }: { trend: Trend | null; delta: number | null }) {
  const t = useT();
  if (!trend || delta === null) return null;
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const color =
    trend === "up"
      ? "text-emerald-400"
      : trend === "down"
        ? "text-destructive"
        : "text-muted-foreground";
  const label =
    trend === "up"
      ? t("examReport.improved", { n: delta })
      : trend === "down"
        ? t("examReport.declined", { n: Math.abs(delta) })
        : t("examReport.stable");
  return (
    <span className={`flex items-center gap-0.5 text-[0.625rem] ${color}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

export function StudentCard({
  report,
  name,
  open,
  onToggle,
}: {
  report: StudentExamReport;
  name: string;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <div
      className={`glass rounded-3xl p-4 space-y-3 ${report.attention.length ? "border border-orange-400/30" : ""}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 text-right"
      >
        <div
          className={`w-10 h-10 shrink-0 rounded-2xl bg-gradient-to-br ${colorFor(report.studentId)} flex items-center justify-center text-white font-black text-sm`}
        >
          {initialOf(name)}
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-sm font-bold text-foreground truncate">{name}</p>
          <div className="flex items-center gap-2 text-[0.625rem] text-muted-foreground flex-wrap">
            <span>{countExams(report.examCount)}</span>
            <span>{t("examReport.lastOn", { day: localDayOf(report.lastAt) })}</span>
            <TrendBadge trend={report.trend} delta={report.trendDelta} />
          </div>
        </div>
        <div className="text-center shrink-0">
          <p
            className={`text-lg font-black leading-none ${percentColor(report.averagePercentage)}`}
          >
            {report.averagePercentage}%
          </p>
          <p className="text-[0.625rem] text-muted-foreground mt-0.5">{t("examReport.average")}</p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {report.attention.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {report.attention.map((a) => (
            <span
              key={a}
              className="flex items-center gap-1 rounded-full bg-orange-400/15 text-orange-400 px-2 py-0.5 text-[0.625rem] font-bold"
            >
              <AlertTriangle className="w-3 h-3" />
              {ATTENTION_LABEL[a]}
            </span>
          ))}
        </div>
      )}

      {open && <StudentDetails report={report} />}
    </div>
  );
}

function StudentDetails({ report }: { report: StudentExamReport }) {
  const t = useT();
  return (
    <div className="space-y-3 pt-1 border-t border-border/40">
      <div className="grid grid-cols-3 gap-2 text-center pt-3">
        <Stat
          label={t("examReport.lastResult")}
          value={`${report.lastPercentage}%`}
          className={percentColor(report.lastPercentage)}
        />
        <Stat label={t("examReport.bestResult")} value={`${report.bestPercentage}%`} />
        <Stat label={t("examReport.examTime")} value={formatDuration(report.totalSeconds)} />
      </div>

      {report.families.length > 0 && (
        <div className="space-y-2">
          <p className="text-[0.6875rem] font-bold text-muted-foreground">
            {t("examReport.byType")}
          </p>
          <FamilyBars families={report.families} />
        </div>
      )}

      {report.weakSpots.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[0.6875rem] font-bold text-muted-foreground flex items-center gap-1">
            <Target className="w-3.5 h-3.5 text-orange-400" /> {t("examReport.weakSpots")}
          </p>
          {report.weakSpots.map((w) => (
            <div
              key={`${w.surahNumber}-${w.fromAyah}`}
              className="flex items-center gap-2 rounded-2xl glass-strong px-3 py-2"
            >
              <p className="flex-1 text-[0.6875rem] text-foreground">
                {t("examReport.spot", { surah: w.surahName, from: w.fromAyah, to: w.toAyah })}
              </p>
              <span className="text-[0.625rem] text-muted-foreground">
                {t("examReport.errors", { n: w.errors })}
                {w.occurrences === 2
                  ? t("examReport.inTwoExams")
                  : w.occurrences > 2
                    ? t("examReport.inExams", { exams: countExams(w.occurrences) })
                    : ""}
              </span>
              {w.pending && (
                <span className="text-[0.625rem] rounded-full bg-orange-400/15 text-orange-400 px-1.5 py-0.5">
                  {t("examReport.notReviewed")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-[0.6875rem] font-bold text-muted-foreground">{t("examReport.exams")}</p>
        {report.results.map((r) => (
          <ResultRow key={r.id} row={r} />
        ))}
      </div>
    </div>
  );
}

function ResultRow({ row }: { row: StudentExamReport["results"][number] }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const pending = row.errors.filter((e) => !e.sent_to_review).length;
  const mastery = (MASTERY_ORDER as string[]).includes(row.mastery)
    ? (row.mastery as MasteryLevel)
    : null;

  async function send() {
    setSending(true);
    try {
      const moved = await sendErrorsToReview(row.id);
      toast.success(t("examReport.sentToReview", { n: moved }));
      await queryClient.invalidateQueries({ queryKey: ["teacher-exam-report"] });
    } catch {
      toast.error(t("examReport.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-2xl glass-strong p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-3.5 h-3.5 text-primary shrink-0" />
        <p className="flex-1 text-[0.6875rem] font-bold text-foreground">
          {row.exam?.scope_label ?? t("examReport.exam")}
        </p>
        <span className={`text-sm font-black ${percentColor(row.percentage)}`}>
          {row.percentage}%
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[0.625rem] text-muted-foreground flex-wrap">
        {row.exam && (
          <>
            <span className="rounded-full px-2 py-0.5 glass">
              {DIFFICULTY_LABEL[row.exam.difficulty as Difficulty] ?? row.exam.difficulty}
            </span>
            <span className="rounded-full px-2 py-0.5 glass">
              {row.exam.mode === "practice" ? t("examReport.practice") : t("examReport.exam")}
            </span>
          </>
        )}
        {mastery && <span className={MASTERY_TEXT[mastery]}>{MASTERY_LABEL[mastery]}</span>}
        <span>
          {t("examReport.counts", { correct: row.correct_count, wrong: row.wrong_count })}
          {row.skipped_count ? t("examReport.skipped", { n: row.skipped_count }) : ""}
        </span>
        <span>{formatDuration(row.duration_seconds)}</span>
        <span className="mr-auto">{localDayOf(row.created_at)}</span>
      </div>
      {pending > 0 && (
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-primary/15 text-primary py-1.5 text-[0.625rem] font-bold disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Repeat className="w-3 h-3" />}
          {t("examReport.sendErrors", { n: pending })}
        </button>
      )}
    </div>
  );
}

export function Untested({ list }: { list: Profile[] }) {
  const t = useT();
  if (!list.length) return null;
  return (
    <section className="glass rounded-3xl p-4 space-y-2">
      <p className="text-[0.6875rem] font-bold text-muted-foreground flex items-center gap-1">
        <UserX className="w-3.5 h-3.5" /> {t("examReport.untested", { n: list.length })}
      </p>
      <p className="text-[0.6875rem] text-foreground leading-relaxed">
        {list.map((s) => s.name).join("، ")}
      </p>
    </section>
  );
}
