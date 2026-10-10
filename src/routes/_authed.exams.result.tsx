import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Award, BookOpenCheck, Check, Repeat, Target, X, Minus } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { sendErrorsToReview } from "@/lib/exam/storage";
import { useSession } from "@/hooks/useSession";
import {
  DIFFICULTY_LABEL,
  MASTERY_LABEL,
  QUESTION_TYPE_LABEL,
  type Difficulty,
  type ExamResult,
  type ExamSnapshot,
} from "@/lib/exam/types";
import { toast } from "@/lib/toast";
import { ShareResultButton } from "@/components/zen/exam/ShareResultButton";

export const Route = createFileRoute("/_authed/exams/result")({
  head: () => ({
    meta: [
      { title: "نتيجة الاختبار — Zen" },
      { name: "description", content: "نتيجة اختبارك القرآني وتحليل أخطائك ومواضع ضعفك." },
    ],
  }),
  component: ResultScreen,
});

type StoredResult = {
  snapshot: ExamSnapshot;
  result: ExamResult;
  resultId: string | null;
};

function ResultScreen() {
  const navigate = useNavigate();
  const { guest } = useSession();
  // النتيجة في sessionStorage (متزامن): تُقرأ عند أول عرض (M12).
  const [data] = useState<StoredResult | null>(() => {
    try {
      const raw = sessionStorage.getItem("zen-exam-result");
      return raw ? (JSON.parse(raw) as StoredResult) : null;
    } catch {
      return null; // لا نتيجة محفوظة
    }
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function pushToReview() {
    if (!data?.resultId) {
      toast.error("النتيجة لم تُحفظ في حسابك بعد — تحقّق من الاتصال.");
      return;
    }
    setSending(true);
    try {
      const moved = await sendErrorsToReview(data.resultId);
      setSent(true);
      toast.success(`أُضيف ${moved} موضعاً إلى المراجعة المتباعدة`);
    } catch {
      toast.error("تعذّر الإرسال إلى المراجعة. أعد المحاولة.");
    } finally {
      setSending(false);
    }
  }

  if (!data) {
    return (
      <PhoneFrame>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
          <p className="text-sm text-foreground text-center">لا نتيجة معروضة.</p>
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

  const { snapshot, result } = data;
  const ring =
    result.percentage >= 90
      ? "text-emerald-400"
      : result.percentage >= 75
        ? "text-primary"
        : result.percentage >= 60
          ? "text-gold"
          : "text-destructive";

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-2 flex items-center gap-3">
          <BackButton fallback="/exams" />
          <div>
            <h1 className="text-xl font-black text-foreground">النتيجة</h1>
            <p className="text-[0.6875rem] text-muted-foreground">{snapshot.scope.label}</p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-3">
          <section className="glass rounded-3xl p-5 text-center space-y-2">
            <p className={`text-4xl font-black ${ring}`}>{result.percentage}%</p>
            <p className="text-xs text-muted-foreground">
              {result.score} من {result.possible} نقطة
            </p>
            <div className="inline-flex items-center gap-1.5 rounded-full glass-strong px-3 py-1">
              <Award className="w-3.5 h-3.5 text-gold" />
              <span className="text-[0.6875rem] font-bold text-foreground">
                {MASTERY_LABEL[result.mastery]}
              </span>
            </div>
            {result.masteryReasons.length > 0 && (
              <ul className="space-y-1 pt-1 text-right">
                {result.masteryReasons.map((reason) => (
                  <li key={reason} className="text-[0.6875rem] text-muted-foreground">
                    • {reason}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ShareResultButton
            percentage={result.percentage}
            scope={snapshot.scope.label}
            summary={`${result.score} / ${result.possible} · ${MASTERY_LABEL[result.mastery]}`}
          />

          <section className="grid grid-cols-3 gap-2">
            <Stat icon={Check} tone="text-emerald-400" label="صحيحة" value={result.correctCount} />
            <Stat icon={X} tone="text-destructive" label="خاطئة" value={result.wrongCount} />
            <Stat
              icon={Minus}
              tone="text-muted-foreground"
              label="متروكة"
              value={result.skippedCount}
            />
          </section>

          {result.byFamily.length > 0 && (
            <section className="glass rounded-3xl p-4 space-y-2">
              <h2 className="text-xs font-bold text-foreground">الأداء بحسب نوع السؤال</h2>
              {result.byFamily.map((row) => (
                <div key={row.family} className="space-y-1">
                  <div className="flex items-center justify-between text-[0.6875rem]">
                    <span className="text-foreground">{row.family}</span>
                    <span className="text-muted-foreground">
                      {row.correct}/{row.total}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${row.total ? (row.correct / row.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </section>
          )}

          {result.byDifficulty.length > 0 && (
            <section className="glass rounded-3xl p-4 space-y-1.5">
              <h2 className="text-xs font-bold text-foreground">الأداء بحسب الصعوبة</h2>
              {result.byDifficulty.map((row) => (
                <p key={row.difficulty} className="text-[0.6875rem] text-muted-foreground">
                  {DIFFICULTY_LABEL[row.difficulty as Difficulty] ?? row.difficulty}: {row.correct}/
                  {row.total}
                </p>
              ))}
            </section>
          )}

          {result.weakSpots.length > 0 && (
            <section className="glass rounded-3xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-orange-400" />
                <h2 className="text-xs font-bold text-foreground">مواضع تحتاج مراجعة</h2>
              </div>
              {result.weakSpots.map((spot) => (
                <p
                  key={`${spot.surah}-${spot.fromAyah}-${spot.toAyah}`}
                  className="text-[0.6875rem] text-muted-foreground"
                >
                  سورة {spot.surahName} · الآيات {spot.fromAyah}–{spot.toAyah}
                  {spot.errors > 1 ? ` · ${spot.errors} أخطاء` : ""}
                </p>
              ))}
              {guest ? (
                <p className="text-[0.6875rem] text-muted-foreground">
                  سجّل الدخول لإضافة هذه المواضع إلى المراجعة المتباعدة مع معلّمك.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={pushToReview}
                  disabled={sending || sent}
                  className="w-full rounded-2xl bg-primary text-primary-foreground py-2.5 text-[0.6875rem] font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <BookOpenCheck className="w-3.5 h-3.5" />
                  {sent
                    ? "أُضيفت إلى المراجعة المتباعدة"
                    : sending
                      ? "جارٍ الإضافة…"
                      : "أضِفها إلى المراجعة المتباعدة"}
                </button>
              )}
            </section>
          )}

          {result.graded.some((a) => a.kind !== "correct") && (
            <section className="glass rounded-3xl p-4 space-y-2">
              <h2 className="text-xs font-bold text-foreground">مراجعة الأخطاء</h2>
              {result.graded
                .filter((a) => a.kind !== "correct")
                .map((a) => (
                  <div key={a.questionId} className="rounded-2xl glass-strong p-3 space-y-0.5">
                    <p className="text-[0.625rem] text-muted-foreground">
                      {QUESTION_TYPE_LABEL[a.type]} ·{" "}
                      {a.kind === "skipped"
                        ? "متروك"
                        : a.kind === "wrong_order"
                          ? "ترتيب خاطئ"
                          : a.kind === "incomplete"
                            ? "إجابة ناقصة"
                            : "غير صحيحة"}
                    </p>
                    <p className="text-[0.6875rem] text-foreground">{a.reference}</p>
                  </div>
                ))}
            </section>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate({ to: "/exams/new", search: { weak: undefined } })}
              className="flex-1 rounded-2xl glass py-3 text-xs font-bold text-foreground flex items-center justify-center gap-1.5"
            >
              <Repeat className="w-3.5 h-3.5" />
              اختبار جديد
            </button>
            {result.weakSpots.length > 0 && (
              <button
                type="button"
                onClick={() => navigate({ to: "/exams/new", search: { weak: "1" } })}
                className="flex-1 rounded-2xl bg-gold py-3 text-xs font-bold text-gold-foreground flex items-center justify-center gap-1.5"
              >
                <Target className="w-3.5 h-3.5" />
                اختبرني في ضعفي
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: "/exams" })}
            className="w-full text-[0.6875rem] text-muted-foreground underline underline-offset-4"
          >
            السجل والاختبارات
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Check;
  tone: string;
  label: string;
  value: number;
}) {
  return (
    <div className="glass rounded-2xl p-3 text-center space-y-1">
      <Icon className={`w-4 h-4 mx-auto ${tone}`} />
      <p className="text-sm font-black text-foreground">{value}</p>
      <p className="text-[0.625rem] text-muted-foreground">{label}</p>
    </div>
  );
}
