import { createFileRoute, Link } from "@tanstack/react-router";
import { StudentPlanCard } from "@/components/zen/MemorizationPlan";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryError } from "@/components/zen/QueryError";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BottomNav } from "@/components/zen/BottomNav";
import { DailyReminder } from "@/components/zen/DailyReminder";
import {
  BookOpen,
  TrendingUp,
  Plus,
  Sparkles,
  Loader2,
  Users,
  Star,
  RefreshCw,
  X,
  CalendarDays,
  FileDown,
  Building2,
} from "lucide-react";
import { useSession } from "@/hooks/useSession";
import {
  getProfile,
  getProgressStats,
  isTeacher as isTeacherCheck,
  listProgress,
  deleteProgress,
  type ProgressRow,
} from "@/lib/zen-api";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/zen/register/ConfirmDialog";
import { askLegacy } from "@/lib/assistant-client";
import { openReportPdf } from "@/lib/report";
import {
  buildReportData,
  entryFeedbackPrompt,
  logSummary,
  weeklyPlanPrompt,
} from "@/lib/quran/progress-report";
import { Stat, LogSheet } from "@/components/zen/quran-progress/LogSheet";
import { ProgressEntry } from "@/components/zen/quran-progress/ProgressEntry";
import { localDayKey, localDayOf } from "@/lib/local-day";
export const Route = createFileRoute("/_authed/quran")({
  component: QuranProgress,
});

function QuranProgress() {
  const { userId } = useSession();
  const [showForm, setShowForm] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  // جواب التقييم الذكي مربوط بالتسجيل الذي طُلب له (كان يظهر تحت أول تسجيل دائماً).
  const [entryAi, setEntryAi] = useState<{ id: string; text: string | null } | null>(null);
  const [entryAiLoading, setEntryAiLoading] = useState(false);
  const [editing, setEditing] = useState<ProgressRow | null>(null);
  const [deleting, setDeleting] = useState<ProgressRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const t = useT();
  const [planText, setPlanText] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const invokeAi = askLegacy;

  // تدقيق 1.2/1.3: React Query بدل الجلب اليدوي — حالة خطأ بدل قائمة فارغة مضلِّلة، والإجماليات من
  // الخادم (كل السجل) لا من آخر 200 تسجيل.
  const qc = useQueryClient();
  const enabled = !!userId;
  const profileQ = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => getProfile(userId!),
    enabled,
  });
  const rowsQ = useQuery({
    queryKey: ["progress", userId],
    queryFn: () => listProgress(userId!),
    enabled,
  });
  const statsQ = useQuery({
    queryKey: ["progress-stats", userId],
    queryFn: () => getProgressStats(userId!),
    enabled,
  });
  const teacherQ = useQuery({
    queryKey: ["is-teacher", userId],
    queryFn: () => isTeacherCheck(userId!),
    enabled,
  });
  const profile = profileQ.data ?? null;
  const rows = useMemo(() => rowsQ.data ?? [], [rowsQ.data]);
  const loading = rowsQ.isPending && enabled;
  const teacher = teacherQ.data ?? false;
  const stats = statsQ.data ?? { total: 0, ayat: 0, days: 0, news: 0, revs: 0 };
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["progress", userId] }),
      qc.invalidateQueries({ queryKey: ["progress-stats", userId] }),
    ]);

  const loggedToday = useMemo(
    () => rows.some((r) => localDayOf(r.created_at) === localDayKey()),
    [rows],
  );

  const askEntryFeedback = async (r: ProgressRow) => {
    if (entryAiLoading) return;
    setEntryAiLoading(true);
    setEntryAi({ id: r.id, text: null });
    try {
      const prompt = entryFeedbackPrompt(r);
      const { text } = await invokeAi({
        data: { mode: "feedback", messages: [{ role: "user", content: prompt }] },
      });
      setEntryAi({ id: r.id, text });
    } catch (e) {
      setEntryAi({
        id: r.id,
        text: `⚠️ ${e instanceof Error ? e.message : t("progressLog.aiFailed")}`,
      });
    } finally {
      setEntryAiLoading(false);
    }
  };

  const askAiFeedback = async () => {
    if (rows.length === 0 || aiLoading) return;
    setAiLoading(true);
    setAiText(null);
    try {
      const summary = logSummary(rows);
      const { text } = await invokeAi({
        data: {
          mode: "feedback",
          messages: [
            { role: "user", content: `سجل الحفظ الأخير:\n${summary}\n\nأعطني تقييماً وتوجيهاً.` },
          ],
        },
      });
      setAiText(text);
    } catch (e) {
      setAiText(`⚠️ ${e instanceof Error ? e.message : "تعذّر جلب التقييم"}`);
    } finally {
      setAiLoading(false);
    }
  };

  /** Personalized weekly revision plan based on the latest memorization log. */
  const makeWeeklyPlan = async () => {
    if (planLoading || rows.length === 0) return;
    setPlanLoading(true);
    setPlanText(null);
    try {
      const prompt = weeklyPlanPrompt(rows);
      const { text } = await invokeAi({
        data: { mode: "learn", messages: [{ role: "user", content: prompt }] },
      });
      setPlanText(text);
    } catch (e) {
      setPlanText(`⚠️ ${e instanceof Error ? e.message : "تعذّر توليد الخطة"}`);
    } finally {
      setPlanLoading(false);
    }
  };

  /** Builds a daily + weekly sessions report with an AI summary and opens the PDF print dialog. */
  const exportPdf = async () => {
    if (pdfLoading || rows.length === 0) return;
    setPdfLoading(true);
    try {
      const { daily, weekly } = buildReportData(rows);

      let aiSummary = "—";
      try {
        const src = daily
          .slice(0, 25)
          .map((d) => `- ${d.date}: ${d.title} ${d.detail}`)
          .join("\n");
        const { text } = await invokeAi({
          data: {
            mode: "feedback",
            messages: [
              {
                role: "user",
                content: `هذه جلسات الحفظ اليومية للطالب:\n${src}\n\nاكتب ملخصاً للتقرير ثم توصيات عملية للأسبوع القادم بصيغة نقاط.`,
              },
            ],
          },
        });
        aiSummary = text;
      } catch {
        /* keep the report even if AI fails */
      }

      await openReportPdf({
        studentName: profile?.name ?? "طالب Zen",
        rangeLabel: `${daily.length} جلسة · ${stats.ayat} آية`,
        stats: [
          { label: "إجمالي الآيات", value: String(stats.ayat) },
          { label: "أيام النشاط", value: String(stats.days) },
          { label: "حفظ جديد", value: String(stats.news) },
          { label: "مراجعة", value: String(stats.revs) },
        ],
        daily,
        weekly,
        aiSummary,
      });
    } finally {
      setPdfLoading(false);
    }
  };

  const isTeacher = teacher;
  const removeEntry = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteProgress(deleting.id);
      toast.success(t("progressLog.deleted"));
      setDeleting(null);
      void refresh();
    } catch {
      toast.error(t("progressLog.failed"));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-foreground">تقدّمك في الحفظ</h1>
            <p className="text-xs text-muted-foreground mt-1">بارك الله في جهدك 🌿</p>
          </div>
          {isTeacher && (
            <div className="flex gap-1.5">
              <Link
                to="/centers"
                className="glass rounded-2xl px-3 py-2 flex items-center gap-1.5 text-xs text-primary font-medium"
              >
                <Building2 className="w-3.5 h-3.5" /> المراكز
              </Link>
              <Link
                to="/teacher"
                search={{ tab: "students" }}
                className="glass rounded-2xl px-3 py-2 flex items-center gap-1.5 text-xs text-primary font-medium"
              >
                <Users className="w-3.5 h-3.5" /> طلابي
              </Link>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto pb-4">
          {/* Stats */}
          <div className="mx-5 glass-strong rounded-3xl p-4 relative overflow-hidden">
            <div className="absolute -left-8 -top-8 w-32 h-32 rounded-full bg-gold/20 blur-3xl" />
            <div className="relative grid grid-cols-3 gap-2">
              <Stat icon={BookOpen} label="آيات" value={String(stats.ayat)} />
              <Stat icon={TrendingUp} label="أيام" value={String(stats.days)} />
              <Stat icon={Star} label="مدخلات" value={String(stats.total)} />
            </div>
            <div className="relative flex gap-2 mt-3 text-[0.625rem]">
              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                جديد · {stats.news}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-gold/15 text-gold">
                مراجعة · {stats.revs}
              </span>
            </div>
          </div>

          <DailyReminder loggedToday={loggedToday} />

          {userId && <StudentPlanCard studentId={userId} />}

          {/* Action buttons */}
          <div className="mx-5 mt-3 flex gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="flex-1 rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-white text-sm font-medium py-3 flex items-center justify-center gap-2 glow-primary"
            >
              <Plus className="w-4 h-4" /> تسجيل حفظ جديد
            </button>
            <button
              onClick={askAiFeedback}
              disabled={aiLoading || rows.length === 0}
              className="rounded-2xl glass-strong px-4 flex items-center gap-1.5 text-xs text-gold font-medium disabled:opacity-50"
            >
              {aiLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              تقييم AI
            </button>
          </div>

          <div className="mx-5 mt-2 flex gap-2">
            <button
              onClick={makeWeeklyPlan}
              disabled={planLoading || rows.length === 0}
              className="flex-1 rounded-2xl glass-strong py-3 flex items-center justify-center gap-1.5 text-xs text-primary font-medium disabled:opacity-50"
            >
              {planLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CalendarDays className="w-4 h-4" />
              )}
              خطة مراجعة أسبوعية
            </button>
            <button
              onClick={exportPdf}
              disabled={pdfLoading || rows.length === 0}
              className="flex-1 rounded-2xl glass-strong py-3 flex items-center justify-center gap-1.5 text-xs text-gold font-medium disabled:opacity-50"
            >
              {pdfLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              تقرير PDF
            </button>
          </div>

          {planText && (
            <div className="mx-5 mt-3 glass-strong rounded-3xl p-4 border border-primary/30 anim-float-in">
              <div className="flex items-center gap-1.5 mb-2">
                <CalendarDays className="w-3.5 h-3.5 text-primary" />
                <span className="text-[0.6875rem] font-medium text-primary">
                  خطة المراجعة الأسبوعية
                </span>
                <button onClick={() => setPlanText(null)} className="ms-auto text-muted-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                {planText}
              </p>
            </div>
          )}

          {aiText && (
            <div className="mx-5 mt-3 glass-strong rounded-3xl p-4 border border-gold/30 anim-float-in">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-gold" />
                <span className="text-[0.6875rem] font-medium text-gold">تقييم مساعد Zen</span>
                <button onClick={() => setAiText(null)} className="ms-auto text-muted-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                {aiText}
              </p>
            </div>
          )}

          <div className="mt-4 px-5 flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">السجل</p>
            <button
              aria-label="تحديث"
              onClick={() => void refresh()}
              className="text-muted-foreground"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="px-3 mt-2 space-y-2">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : rowsQ.isError ? (
              <QueryError onRetry={() => void rowsQ.refetch()} />
            ) : rows.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-10">
                لا يوجد تسجيل بعد. ابدأ بإضافة أول حفظ 🌿
              </p>
            ) : (
              rows.map((r, i) => (
                <ProgressEntry
                  key={r.id}
                  r={r}
                  index={i}
                  ai={entryAi?.id === r.id ? { text: entryAi.text, loading: entryAiLoading } : null}
                  onAsk={() => void askEntryFeedback(r)}
                  onDismiss={() => setEntryAi(null)}
                  onEdit={() => setEditing(r)}
                  onDelete={() => setDeleting(r)}
                />
              ))
            )}
          </div>
        </div>

        <BottomNav />

        {(showForm || editing) && userId && (
          <LogSheet
            key={editing?.id ?? "new"}
            userId={userId}
            editing={editing}
            onClose={() => {
              setShowForm(false);
              setEditing(null);
            }}
            onSaved={() => {
              toast.success(t(editing ? "progressLog.updated" : "progressLog.saved"));
              setShowForm(false);
              setEditing(null);
              void refresh();
            }}
          />
        )}
        <ConfirmDialog
          open={!!deleting}
          title={t("progressLog.deleteTitle", { name: deleting?.surah_name ?? "" })}
          body={t("progressLog.deleteBody")}
          confirmLabel={t("progressLog.delete")}
          destructive
          busy={deleteBusy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void removeEntry()}
        />
      </div>
    </PhoneFrame>
  );
}
