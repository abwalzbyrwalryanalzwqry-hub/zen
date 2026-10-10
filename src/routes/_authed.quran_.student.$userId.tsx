import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";
import { TeacherPlanReview } from "@/components/zen/MemorizationPlan";
import { TeacherWeekSummary } from "@/components/zen/TeacherWeekSummary";
import { TeacherDrafts } from "@/components/zen/TeacherDrafts";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryError } from "@/components/zen/QueryError";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { BottomNav } from "@/components/zen/BottomNav";
import { StudentQuickActions } from "@/components/zen/teacher/StudentQuickActions";
import { Loader2, Settings2, Star } from "lucide-react";
import { StudentManageSheet } from "@/components/zen/teacher/StudentManageSheet";
import { toast } from "@/lib/toast";
import { useSession } from "@/hooks/useSession";
import { GuardianLinkCard } from "@/components/guardian/GuardianLinkCard";
import { StudentReportExport } from "@/components/zen/CenterManagement";
import { KhatmForecastCard } from "@/components/zen/KhatmForecastCard";
import { AchievementsSummary } from "@/components/zen/Achievements";
import { TeacherPasswordCard } from "@/components/zen/LoginSecurity";
import { StudentDailyOverview } from "@/components/zen/teacher/StudentDailyOverview";
import { StudentRecordEdits } from "@/components/zen/register/RecordAuditTab";
import {
  colorFor,
  getProfile,
  getProgressStats,
  initialOf,
  isTeacher,
  listProgress,
  reviewProgress,
  timeAgo,
  type ProgressRow,
} from "@/lib/zen-api";
import { ayahSpan } from "@/lib/format";
import { usePagesDict } from "@/lib/pages-i18n";

export const Route = createFileRoute("/_authed/quran_/student/$userId")({
  component: StudentDetail,
});

function StudentDetail() {
  usePagesDict();
  const t = useT();
  const { userId: studentId } = Route.useParams();
  const { userId: myId } = useSession();
  const navigate = useNavigate();
  const [managing, setManaging] = useState(false);
  // تدقيق 1.2/1.3: React Query مع حالة خطأ، والعدد الكلي من الخادم لا من آخر 200 تسجيل.
  const qc = useQueryClient();
  const enabled = !!myId;
  const teacherQ = useQuery({
    queryKey: ["is-teacher", myId],
    queryFn: () => isTeacher(myId!),
    enabled,
  });
  const studentQ = useQuery({
    queryKey: ["profile", studentId],
    queryFn: () => getProfile(studentId),
    enabled,
  });
  const rowsQ = useQuery({
    queryKey: ["progress", studentId],
    queryFn: () => listProgress(studentId),
    enabled,
  });
  const statsQ = useQuery({
    queryKey: ["progress-stats", studentId],
    queryFn: () => getProgressStats(studentId),
    enabled,
  });
  const canReview = teacherQ.data ?? false;
  const student = studentQ.data ?? null;
  const rows: ProgressRow[] = rowsQ.data ?? [];
  const loading = enabled && (rowsQ.isPending || teacherQ.isPending);
  const total = statsQ.data?.total ?? rows.length;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["progress", studentId] });
    void qc.invalidateQueries({ queryKey: ["progress-stats", studentId] });
  };

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/teacher" />
          {student && (
            <>
              <div
                className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${colorFor(student.id)} flex items-center justify-center text-white font-black`}
              >
                {initialOf(student.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-foreground truncate">{student.name}</p>
                <p className="text-[0.625rem] text-muted-foreground">
                  {t("studentPage.records", { n: total })}
                </p>
              </div>
              {canReview && myId && myId !== studentId && (
                <button
                  type="button"
                  onClick={() => setManaging(true)}
                  aria-haspopup="dialog"
                  className="min-h-11 px-3 rounded-2xl glass text-xs font-bold text-primary flex items-center gap-1.5"
                >
                  <Settings2 className="w-4 h-4" aria-hidden="true" />
                  {t("studentManage.cta")}
                </button>
              )}
            </>
          )}
        </header>
        {canReview && myId && myId !== studentId && (
          <StudentQuickActions me={myId} studentId={studentId} />
        )}

        <div className="flex-1 overflow-y-auto px-3 pt-2 space-y-2 pb-4">
          {canReview && !loading && (
            <details className="glass-strong rounded-3xl">
              <summary className="px-4 py-3 text-xs font-bold text-foreground cursor-pointer">
                {t("studentPage.guardians")}
              </summary>
              <GuardianLinkCard studentId={studentId} asTeacher />
            </details>
          )}
          {/* قاعدة البيانات تتحقق: معلّم حلقة هذا الطالب فقط، والطالب ليس معلّماً. */}
          {canReview && !loading && <TeacherPasswordCard studentId={studentId} />}
          {(canReview || myId === studentId) && !loading && (
            // قاعدة البيانات تتحقق: الطالب نفسه أو معلّمه أو ولي أمره أو طاقم مركزه.
            <StudentReportExport studentId={studentId} studentName={student?.name} />
          )}
          {canReview && !loading && <StudentDailyOverview studentId={studentId} />}
          {canReview && !loading && <TeacherWeekSummary studentId={studentId} />}
          {canReview && !loading && <StudentRecordEdits studentId={studentId} />}
          {canReview && !loading && <TeacherDrafts studentId={studentId} />}
          {canReview && !loading && <TeacherPlanReview studentId={studentId} />}
          {canReview && !loading && <AchievementsSummary studentId={studentId} />}
          {canReview && !loading && (
            <KhatmForecastCard studentId={studentId} title={t("studentPage.khatm")} />
          )}
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : rowsQ.isError || teacherQ.isError ? (
            <QueryError
              onRetry={() => {
                void teacherQ.refetch();
                void rowsQ.refetch();
              }}
            />
          ) : !canReview ? (
            <p className="text-center text-xs text-muted-foreground py-10">
              {t("studentPage.teachersOnly")}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-10">
              {t("studentPage.noRecords")}
            </p>
          ) : (
            rows.map((r) => <ProgressCard key={r.id} row={r} reviewerId={myId!} onDone={refresh} />)
          )}
        </div>

        <BottomNav />
        {managing && myId && student && (
          <StudentManageSheet
            me={myId}
            student={{ id: student.id, name: student.name }}
            onClose={() => setManaging(false)}
            onRemoved={() => void navigate({ to: "/teacher", search: { tab: "students" } })}
          />
        )}
      </div>
    </PhoneFrame>
  );
}

function ProgressCard({
  row,
  reviewerId,
  onDone,
}: {
  row: ProgressRow;
  reviewerId: string;
  onDone: () => void;
}) {
  const t = useT();
  const [rating, setRating] = useState(row.rating ?? 0);
  const [feedback, setFeedback] = useState(row.feedback ?? "");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const save = async () => {
    if (saving || rating < 1) return;
    setSaving(true);
    try {
      await reviewProgress(row.id, rating, feedback.trim(), reviewerId);
      setOpen(false);
      onDone();
    } catch {
      toast.error(t("studentPage.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-3.5">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-foreground">
            {t("studentPage.surah", { name: row.surah_name })}
          </p>
          <p className="text-[0.625rem] text-muted-foreground">
            {t("studentPage.ayat", { span: ayahSpan(row.from_ayah, row.to_ayah) })} ·{" "}
            {row.memorization_type === "new" ? t("studentPage.new") : t("studentPage.review")}
          </p>
        </div>
        <span className="text-[0.625rem] text-muted-foreground">{timeAgo(row.created_at)}</span>
      </div>
      {row.notes && <p className="text-[0.6875rem] text-muted-foreground mt-1">📝 {row.notes}</p>}

      {row.rating != null && !open && (
        <div className="mt-2 flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, k) => (
            <Star
              key={k}
              className={`w-3 h-3 ${k < (row.rating ?? 0) ? "fill-gold text-gold" : "text-muted-foreground/40"}`}
            />
          ))}
          {row.feedback && (
            <span className="text-[0.625rem] text-muted-foreground me-2">— {row.feedback}</span>
          )}
        </div>
      )}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-2 text-[0.6875rem] px-3 py-1 rounded-full bg-primary/15 text-primary font-medium"
        >
          {row.rating != null ? t("studentPage.editRating") : t("studentPage.addRating")}
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 5 }).map((_, k) => (
              <button key={k} onClick={() => setRating(k + 1)}>
                <Star
                  className={`w-5 h-5 ${k < rating ? "fill-gold text-gold" : "text-muted-foreground/40"}`}
                />
              </button>
            ))}
          </div>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            placeholder={t("studentPage.notesPh")}
            className="w-full glass rounded-xl px-3 py-2 text-xs outline-none resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving || rating < 1}
              className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium disabled:opacity-60"
            >
              {saving ? t("assign.saving") : t("studentPage.saveRating")}
            </button>
            <button onClick={() => setOpen(false)} className="px-3 py-2 rounded-xl glass text-xs">
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
