import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Flag, SkipForward, Timer, X } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { useSession } from "@/hooks/useSession";
import { gradeAttempt, gradeQuestion } from "@/lib/exam/engine";
import {
  clearActiveExam,
  loadActiveExam,
  pushProgress,
  pushResult,
  recordLocalResult,
  saveActiveExam,
  type ActiveExamState,
} from "@/lib/exam/storage";
import { QUESTION_TYPE_LABEL, type ExamQuestion, type QuestionAnswer } from "@/lib/exam/types";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/_authed/exams/run")({
  head: () => ({
    meta: [
      { title: "جارٍ الاختبار — Zen" },
      { name: "description", content: "أسئلة الاختبار القرآني داخل النطاق الذي حدّدته." },
    ],
  }),
  component: RunExamScreen,
});

const secondsSince = (start: number) => Math.round((Date.now() - start) / 1000);

function RunExamScreen() {
  const navigate = useNavigate();
  const { userId, guest } = useSession();
  // الاختبار الجاري محفوظ محلياً (متزامن): يُقرأ عند أول عرض (M12).
  const [state, setState] = useState<ActiveExamState | null>(loadActiveExam);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const questionStart = useRef(0);

  const snapshot = state?.snapshot;
  const attempt = state?.attempt;
  const question: ExamQuestion | undefined = snapshot?.questions[attempt?.currentIndex ?? 0];
  const answered = question ? attempt?.answers[question.id] : undefined;
  const isPractice = snapshot?.blueprint.mode === "practice";

  // مؤقّت اختياري: لكل سؤال أو للاختبار كلّه — لا يعمل إن لم يطلبه المستخدم.
  const timer = snapshot?.blueprint.timer;
  useEffect(() => {
    if (!timer || timer.mode === "none") return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  useEffect(() => {
    questionStart.current = Date.now();
  }, [attempt?.currentIndex]);

  // سؤال جديد: مؤقّت السؤال من الصفر، وترتيب سؤال الترتيب يبدأ من المحفوظ أو مخلوطاً كما وردت الخيارات
  // في اللقطة — أثناء العرض لا في أثر (M12).
  const [shownFor, setShownFor] = useState<{
    index: number | undefined;
    question: ExamQuestion | undefined;
    saved: unknown;
  }>({ index: undefined, question: undefined, saved: undefined });
  if (
    shownFor.index !== attempt?.currentIndex ||
    shownFor.question !== question ||
    shownFor.saved !== answered?.value
  ) {
    if (shownFor.index !== attempt?.currentIndex && timer?.mode === "per_question") setElapsed(0);
    setShownFor({ index: attempt?.currentIndex, question, saved: answered?.value });
    const saved = answered?.value;
    if (question?.answerShape !== "ordering") setOrder([]);
    else setOrder(Array.isArray(saved) ? saved : question.options.map((o) => o.id));
  }

  const update = useCallback((next: ActiveExamState) => {
    setState(next);
    saveActiveExam(next);
  }, []);

  const secondsSpent = () => secondsSince(questionStart.current);

  function answer(value: string | string[] | null, keepFlag = true) {
    if (!state || !question) return;
    const previous = state.attempt.answers[question.id];
    const record: QuestionAnswer = {
      questionId: question.id,
      value,
      flagged: keepFlag ? (previous?.flagged ?? false) : false,
      seconds: (previous?.seconds ?? 0) + secondsSpent(),
      answeredAt: value === null ? null : new Date().toISOString(),
    };
    update({
      ...state,
      attempt: { ...state.attempt, answers: { ...state.attempt.answers, [question.id]: record } },
    });
  }

  function toggleFlag() {
    if (!state || !question) return;
    const previous = state.attempt.answers[question.id];
    const record: QuestionAnswer = {
      questionId: question.id,
      value: previous?.value ?? null,
      flagged: !(previous?.flagged ?? false),
      seconds: previous?.seconds ?? 0,
      answeredAt: previous?.answeredAt ?? null,
    };
    update({
      ...state,
      attempt: { ...state.attempt, answers: { ...state.attempt.answers, [question.id]: record } },
    });
  }

  function move(delta: number) {
    if (!state || !snapshot) return;
    const next = Math.max(
      0,
      Math.min(snapshot.questions.length - 1, state.attempt.currentIndex + delta),
    );
    const updated: ActiveExamState = {
      ...state,
      attempt: { ...state.attempt, currentIndex: next },
    };
    update(updated);
    if (state.synced) void pushProgress(updated.attempt);
  }

  async function submit() {
    if (!state || !snapshot) return;
    setSubmitting(true);
    try {
      const finished = {
        ...state.attempt,
        status: "submitted" as const,
        endedAt: new Date().toISOString(),
      };
      const result = gradeAttempt(snapshot, finished);
      if (guest) recordLocalResult(snapshot, result);
      const remote = userId && !guest ? await pushResult(finished, result, userId) : null;
      sessionStorage.setItem(
        "zen-exam-result",
        JSON.stringify({ snapshot, attempt: finished, result, resultId: remote?.resultId ?? null }),
      );
      clearActiveExam();
      await navigate({ to: "/exams/result" });
    } catch {
      toast.error("تعذّر حفظ النتيجة. أعد المحاولة.");
    } finally {
      setSubmitting(false);
    }
  }

  const progress = useMemo(() => {
    if (!snapshot || !attempt) return { done: 0, total: 0 };
    const done = Object.values(attempt.answers).filter((a) => a.value !== null).length;
    return { done, total: snapshot.questions.length };
  }, [snapshot, attempt]);

  if (!state || !snapshot || !attempt || !question) {
    return (
      <PhoneFrame>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
          <p className="text-sm text-foreground text-center">لا اختبار قائم الآن.</p>
          <button
            type="button"
            onClick={() => navigate({ to: "/exams" })}
            className="rounded-2xl bg-primary text-primary-foreground px-5 py-2.5 text-xs font-bold"
          >
            إلى الاختبارات
          </button>
        </div>
      </PhoneFrame>
    );
  }

  const graded = isPractice && answered?.value ? gradeQuestion(question, answered) : null;
  const timeLeft =
    timer && timer.mode !== "none" && timer.seconds ? Math.max(0, timer.seconds - elapsed) : null;

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-4 pt-12 pb-2 space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate({ to: "/exams" })}
              aria-label="إيقاف مؤقّت والعودة"
              className="w-9 h-9 rounded-xl glass flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4 text-foreground" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[0.6875rem] font-bold text-foreground truncate">
                {snapshot.scope.label}
              </p>
              <p className="text-[0.625rem] text-muted-foreground">
                سؤال {attempt.currentIndex + 1} من {snapshot.questions.length} · أُجيب{" "}
                {progress.done}
              </p>
            </div>
            {timeLeft !== null && (
              <span
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold ${
                  timeLeft <= 10 ? "bg-destructive/20 text-destructive" : "glass text-foreground"
                }`}
              >
                <Timer className="w-3 h-3" />
                {timeLeft}
              </span>
            )}
            <button
              type="button"
              onClick={toggleFlag}
              aria-label={answered?.flagged ? "إلغاء تعليم السؤال" : "تعليم السؤال للمراجعة"}
              aria-pressed={!!answered?.flagged}
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                answered?.flagged ? "bg-gold text-gold-foreground" : "glass text-foreground"
              }`}
            >
              <Flag className="w-4 h-4" />
            </button>
          </div>

          <div
            className="h-1.5 rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuenow={attempt.currentIndex + 1}
            aria-valuemin={1}
            aria-valuemax={snapshot.questions.length}
            aria-label="تقدّم الاختبار"
          >
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: `${((attempt.currentIndex + 1) / snapshot.questions.length) * 100}%`,
              }}
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-3">
          <div className="glass rounded-3xl p-4 space-y-3">
            <span className="inline-block rounded-full glass-strong px-2.5 py-0.5 text-[0.625rem] text-muted-foreground">
              {QUESTION_TYPE_LABEL[question.type]}
            </span>
            <p className="text-sm font-bold text-foreground leading-relaxed">{question.prompt}</p>
            {question.passage && (
              <p className="font-quran text-lg leading-loose text-foreground/95 text-center px-1">
                {question.passage}
              </p>
            )}
          </div>

          {question.answerShape === "ordering" ? (
            <OrderingAnswer
              order={order}
              options={question.options}
              onChange={(next) => {
                setOrder(next);
                answer(next);
              }}
            />
          ) : (
            <div className="space-y-2">
              {question.options.map((option) => {
                const selected = answered?.value === option.id;
                const isCorrect = graded && option.id === question.correct;
                const isWrongPick = graded && selected && graded.kind !== "correct";
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => !graded && answer(option.id)}
                    aria-pressed={selected}
                    className={`w-full text-right rounded-2xl px-4 py-3 transition border ${
                      isCorrect
                        ? "border-emerald-500/60 bg-emerald-500/10"
                        : isWrongPick
                          ? "border-destructive/60 bg-destructive/10"
                          : selected
                            ? "border-primary bg-primary/10"
                            : "border-transparent glass"
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      {isCorrect && <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                      {isWrongPick && <X className="w-4 h-4 text-destructive shrink-0 mt-0.5" />}
                      <span
                        className={`flex-1 ${
                          option.ref || question.type === "spot_the_error"
                            ? "font-quran text-base leading-loose"
                            : "text-xs"
                        } text-foreground`}
                      >
                        {option.text}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {graded && (
            <div className="glass rounded-2xl p-3 space-y-1" aria-live="polite">
              <p
                className={`text-xs font-bold ${
                  graded.kind === "correct" ? "text-emerald-400" : "text-destructive"
                }`}
              >
                {graded.kind === "correct" ? "إجابة صحيحة" : "إجابة غير صحيحة"}
              </p>
              <p className="text-[0.6875rem] text-muted-foreground">الموضع: {question.reference}</p>
            </div>
          )}
        </div>

        <div className="px-4 pb-6 pt-2 space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => move(-1)}
              disabled={attempt.currentIndex === 0}
              aria-label="السؤال السابق"
              className="w-11 h-11 rounded-2xl glass flex items-center justify-center disabled:opacity-60"
            >
              <ChevronRight className="w-4 h-4 text-foreground" />
            </button>
            <button
              type="button"
              onClick={() => {
                answer(null);
                if (attempt.currentIndex < snapshot.questions.length - 1) move(1);
              }}
              className="flex-1 h-11 rounded-2xl glass flex items-center justify-center gap-1.5 text-xs font-bold text-muted-foreground"
            >
              <SkipForward className="w-3.5 h-3.5" />
              تخطٍّ
            </button>
            {attempt.currentIndex < snapshot.questions.length - 1 ? (
              <button
                type="button"
                onClick={() => move(1)}
                aria-label="السؤال التالي"
                className="w-11 h-11 rounded-2xl bg-primary flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4 text-primary-foreground" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="h-11 rounded-2xl bg-primary px-5 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {submitting ? "جارٍ التصحيح…" : "تسليم"}
              </button>
            )}
          </div>
          {attempt.currentIndex < snapshot.questions.length - 1 && (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="w-full text-[0.6875rem] text-muted-foreground underline underline-offset-4"
            >
              تسليم الاختبار الآن
            </button>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
}

/** سؤال الترتيب: أسهم لتحريك الآية لأعلى ولأسفل — أوضح من السحب على الجوال. */
function OrderingAnswer({
  order,
  options,
  onChange,
}: {
  order: string[];
  options: ExamQuestion["options"];
  onChange: (next: string[]) => void;
}) {
  const byId = new Map(options.map((o) => [o.id, o]));
  function swap(i: number, j: number) {
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  return (
    <ol className="space-y-2">
      {order.map((id, i) => (
        <li key={id} className="glass rounded-2xl p-3 flex items-start gap-2">
          <span className="w-6 h-6 rounded-lg bg-primary/20 text-primary text-[0.6875rem] font-bold flex items-center justify-center shrink-0">
            {i + 1}
          </span>
          <span className="flex-1 font-quran text-base leading-loose text-foreground">
            {byId.get(id)?.text ?? ""}
          </span>
          <span className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => swap(i, i - 1)}
              aria-label={`تحريك الآية ${i + 1} لأعلى`}
              className="w-6 h-6 rounded-md glass-strong text-[0.625rem] text-foreground"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => swap(i, i + 1)}
              aria-label={`تحريك الآية ${i + 1} لأسفل`}
              className="w-6 h-6 rounded-md glass-strong text-[0.625rem] text-foreground"
            >
              ▼
            </button>
          </span>
        </li>
      ))}
    </ol>
  );
}
