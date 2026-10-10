import { useState } from "react";
import { Loader2, Mic, Play, Sparkles } from "lucide-react";
import { colorFor, initialOf } from "@/lib/zen-api";
import {
  assessRecitation,
  getRecitationAudioUrl,
  KIND_LABEL,
  type RecitationSession,
} from "@/lib/zen-lms";
import { transcribeRecitation, coachRecitation } from "@/lib/recitation-client";
import { formatAyahRange, formatDay } from "@/lib/format";
import {
  GRADE_PRESETS,
  gradeLabel,
  gradeOf,
  initialReview,
  RECITATION_ERROR_TYPES,
} from "@/lib/grading";
import { useT } from "@/lib/i18n";

/* ─────────── Review tab ─────────── */

/**
 * قائمة التسميعات المنتظرة. كل بطاقة مكوّن مستقل بحالته (الدرجة، الأخطاء، الملاحظات، خطأ التحليل):
 * كانت هذه الحالة مشتركة بين البطاقات فيُحفظ ما أدخله المعلّم لطالب على الطالب التالي (فحص الأقسام T1/T2).
 * رسالة «حُفظ» تظهر أعلى القائمة لأن بطاقة الطالب تُزال بعد الحفظ.
 */
export function ReviewTab({
  pending,
  nameOf,
  teacherId,
  onDone,
}: {
  pending: RecitationSession[];
  nameOf: (id: string) => string;
  teacherId: string;
  onDone: (id: string) => void;
}) {
  const t = useT();
  const [notice, setNotice] = useState<string | null>(null);

  if (pending.length === 0)
    return (
      <>
        {notice && <Notice text={notice} />}
        <p className="text-center text-xs text-muted-foreground py-12">{t("review.empty")}</p>
      </>
    );

  return (
    <>
      {notice && <Notice text={notice} />}
      {pending.map((s) => (
        <ReviewCard
          key={s.id}
          s={s}
          name={nameOf(s.student_id)}
          teacherId={teacherId}
          onSaved={(text) => {
            setNotice(text);
            onDone(s.id);
          }}
        />
      ))}
    </>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <p role="status" className="glass rounded-2xl p-3 text-[0.6875rem] text-primary text-center">
      {text}
    </p>
  );
}

export function ReviewCard({
  s,
  name,
  teacherId,
  onSaved,
}: {
  s: RecitationSession;
  name: string;
  teacherId: string;
  onSaved: (notice: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [audio, setAudio] = useState<string | null>(null);
  const [form, setForm] = useState(() => initialReview(s.ai_score));
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<{ transcript: string; feedback: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { score, errs, notes } = form;

  const play = async () => {
    if (!s.audio_path || audio) return;
    const url = await getRecitationAudioUrl(s.audio_path);
    if (url) setAudio(url);
  };

  /**
   * تحليل ذكي للتلاوة: التسجيل يُقرأ من التخزين على الخادم (لا يُرسَل من
   * المتصفح)، فيُفرَّغ نصاً ثم يُقارَن بالرسم العثماني لإخراج ملاحظات تجويد.
   */
  const analyze = async () => {
    if (analyzing || !s.audio_path) return;
    setAnalyzing(true);
    setError(null);
    try {
      // النص المرجعي والدرجة يُحسبان ويُحفظان على الخادم من المتن الموثَّق.
      const { transcript } = await transcribeRecitation({ data: { sessionId: s.id } });
      const { text: feedback } = await coachRecitation({ data: { sessionId: s.id } });
      setAnalysis({ transcript, feedback });
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("review.analyzeFailed"));
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async (approved: boolean) => {
    if (score === null) {
      setError(t("grading.pick"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const schedule = await assessRecitation({
        session_id: s.id,
        student_id: s.student_id,
        teacher_id: teacherId,
        surah_name: s.surah_name,
        from_ayah: s.from_ayah,
        to_ayah: s.to_ayah,
        score,
        errors: errs.map((type) => ({ type, note: "" })),
        teacher_notes: notes || null,
        ai_summary: analysis?.feedback ?? null,
        approved,
      });
      onSaved(
        t("grading.saved", {
          name,
          date: formatDay(schedule.due_date),
          days: schedule.interval_days,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("review.saveFailed"));
      setBusy(false);
    }
  };

  const toggleErr = (type: string) =>
    setForm((f) => ({
      ...f,
      errs: f.errs.includes(type) ? f.errs.filter((x) => x !== type) : [...f.errs, type],
    }));

  return (
    <div className="glass rounded-3xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div
          className={`w-9 h-9 rounded-2xl bg-gradient-to-br ${colorFor(s.student_id)} flex items-center justify-center text-white font-black text-sm`}
        >
          {initialOf(name)}
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">{name}</p>
          <p className="text-[0.6875rem] text-muted-foreground">
            {[
              formatAyahRange(s.surah_name, s.from_ayah, s.to_ayah),
              KIND_LABEL[s.kind],
              formatDay(s.session_date),
            ].join(" · ")}
          </p>
        </div>
        <Mic className="w-4 h-4 text-gold" aria-hidden="true" />
      </div>

      {s.audio_path &&
        (audio ? (
          <audio controls src={audio} className="w-full" />
        ) : (
          <button
            onClick={() => void play()}
            className="w-full flex items-center justify-center gap-2 rounded-2xl glass-strong py-2 text-xs"
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" /> {t("review.loadAudio")}
          </button>
        ))}

      {s.audio_path && (
        <button
          onClick={() => void analyze()}
          disabled={analyzing}
          className="w-full flex items-center justify-center gap-2 rounded-2xl glass-strong border-gold/40 py-2 text-xs font-semibold text-gold disabled:opacity-60"
        >
          {analyzing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />{" "}
              {t("review.analyzing")}
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> {t("review.analyze")}
            </>
          )}
        </button>
      )}

      {!analysis && typeof s.ai_score === "number" && (
        <div className="rounded-2xl glass-strong p-3 space-y-1">
          <p className="text-[0.6875rem] text-muted-foreground">
            {t("review.savedAnalysis")}{" "}
            <span className="text-primary font-bold">{s.ai_score}%</span>
          </p>
          {s.ai_analysis?.coach && (
            <p className="text-[0.6875rem] leading-6 text-foreground/80 whitespace-pre-line">
              {s.ai_analysis.coach}
            </p>
          )}
          {s.transcript && (
            <details className="text-[0.625rem] text-muted-foreground">
              <summary>{t("review.heard")}</summary>
              <p className="pt-1 text-[0.6875rem] text-foreground/70 leading-6">{s.transcript}</p>
            </details>
          )}
        </div>
      )}

      {analysis && (
        <div className="rounded-2xl glass-strong p-3 space-y-2">
          <div>
            <p className="text-[0.625rem] text-muted-foreground mb-1">{t("review.heard")}</p>
            <p className="text-[0.6875rem] leading-relaxed text-foreground">
              {analysis.transcript}
            </p>
          </div>
          <div className="border-t border-border/40 pt-2">
            <p className="text-[0.625rem] text-gold mb-1">{t("review.aiNotes")}</p>
            <p className="text-[0.6875rem] leading-relaxed whitespace-pre-line text-foreground">
              {analysis.feedback}
            </p>
          </div>
          <button
            onClick={() => setForm((f) => ({ ...f, notes: analysis.feedback }))}
            className="text-[0.625rem] text-primary underline"
          >
            {t("review.copyNotes")}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-[0.6875rem] text-destructive text-center">
          {error}
        </p>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full rounded-2xl bg-primary text-primary-foreground py-2.5 text-xs font-semibold"
      >
        {open ? t("review.close") : t("review.grade")}
      </button>

      {open && (
        <div className="space-y-3 pt-1">
          <div>
            <div className="flex items-center justify-between text-[0.6875rem] text-muted-foreground">
              <span>{t("grading.label")}</span>
              <span className="text-primary font-bold" aria-live="polite">
                {score === null
                  ? t("grading.pick")
                  : `${score}/100 · ${gradeLabel(gradeOf(score))}`}
              </span>
            </div>
            <div className="flex gap-1 my-2" role="group" aria-label={t("grading.label")}>
              {GRADE_PRESETS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setForm((f) => ({ ...f, score: g.score, suggested: false }))}
                  aria-pressed={score !== null && gradeOf(score) === g.key}
                  className={`flex-1 rounded-xl py-1.5 text-[0.625rem] font-bold ${score !== null && gradeOf(score) === g.key ? "bg-primary/20 text-primary" : "glass-strong text-muted-foreground"}`}
                >
                  {gradeLabel(g.key)}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={score ?? 0}
              aria-label={t("grading.slider")}
              onChange={(e) =>
                setForm((f) => ({ ...f, score: Number(e.target.value), suggested: false }))
              }
              className={`w-full accent-emerald-500 ${score === null ? "opacity-40" : ""}`}
            />
            <p className="text-[0.625rem] text-muted-foreground">
              {form.suggested ? t("grading.suggested") : t("grading.scheduled")}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RECITATION_ERROR_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => toggleErr(type)}
                aria-pressed={errs.includes(type)}
                className={`text-[0.625rem] rounded-full px-2.5 py-1 ${errs.includes(type) ? "bg-gold text-gold-foreground font-bold" : "glass-strong text-muted-foreground"}`}
              >
                {type}
              </button>
            ))}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder={t("review.notesPh")}
            rows={2}
            className="w-full rounded-2xl glass-strong p-3 text-xs bg-transparent outline-none"
          />
          <div className="flex gap-2">
            <button
              disabled={busy || score === null}
              onClick={() => void save(true)}
              className="flex-1 rounded-2xl bg-primary text-primary-foreground py-2.5 text-xs font-bold disabled:opacity-60"
            >
              {t("review.approve")}
            </button>
            <button
              disabled={busy || score === null}
              onClick={() => void save(false)}
              className="flex-1 rounded-2xl bg-gold text-gold-foreground py-2.5 text-xs font-bold disabled:opacity-60"
            >
              {t("review.redo")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
