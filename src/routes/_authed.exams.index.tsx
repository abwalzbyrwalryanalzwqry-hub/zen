import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, ChevronLeft, Loader2, Plus, Target, PlayCircle } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BottomNav } from "@/components/zen/BottomNav";
import { useSession } from "@/hooks/useSession";
import { listExamHistory, listWeakSpots, loadActiveExam } from "@/lib/exam/storage";
import {
  DIFFICULTY_LABEL,
  MASTERY_LABEL,
  type Difficulty,
  type MasteryLevel,
} from "@/lib/exam/types";
import { localDayOf } from "@/lib/local-day";

export const Route = createFileRoute("/_authed/exams/")({
  head: () => ({
    meta: [
      { title: "الاختبارات — Zen" },
      {
        name: "description",
        content:
          "اختبارات قرآنية دقيقة: حدّد نطاقك من سورة أو أجزاء أو مقاطع مخصصة، واختر الأنواع والصعوبة، وتابع نتائجك ومواضع ضعفك.",
      },
      { property: "og:title", content: "الاختبارات — Zen" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ExamsScreen,
});

function masteryColor(level: string): string {
  switch (level) {
    case "mastery":
      return "text-emerald-400";
    case "proficient":
      return "text-primary";
    case "good":
      return "text-gold";
    case "needs_review":
      return "text-orange-400";
    default:
      return "text-destructive";
  }
}

function ExamsScreen() {
  const { userId } = useSession();
  const active = loadActiveExam();

  const history = useQuery({
    queryKey: ["exam-history", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: () => listExamHistory(userId!, 30),
  });

  const weak = useQuery({
    queryKey: ["exam-weak-spots", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: () => listWeakSpots(userId!, 10),
  });

  const weakSpots = weak.data ?? [];

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">الاختبارات</h1>
            <p className="text-[0.6875rem] text-muted-foreground">اختبر حفظك بنطاق تحدّده بدقة</p>
          </div>
          <Link
            to="/today"
            aria-label="رجوع إلى واجب اليوم"
            className="w-9 h-9 rounded-xl glass flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </Link>
        </header>

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
          {active && (
            <Link
              to="/exams/run"
              className="block glass rounded-3xl p-4 border border-gold/40 space-y-1"
            >
              <div className="flex items-center gap-2">
                <PlayCircle className="w-4 h-4 text-gold" />
                <p className="flex-1 text-sm font-bold text-foreground">متابعة اختبار غير مكتمل</p>
              </div>
              <p className="text-[0.6875rem] text-muted-foreground">
                {active.snapshot.scope.label} · سؤال{" "}
                {Math.min(active.attempt.currentIndex + 1, active.snapshot.questions.length)} من{" "}
                {active.snapshot.questions.length}
              </p>
            </Link>
          )}

          <Link
            to="/exams/new"
            search={{ weak: undefined }}
            className="block rounded-3xl bg-primary text-primary-foreground p-4 space-y-1"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <p className="flex-1 text-sm font-bold">اختبار جديد</p>
            </div>
            <p className="text-[0.6875rem] opacity-80">
              سورة، أو من جزء إلى جزء، أو من سورة إلى سورة، أو نطاق مخصص من عدة مقاطع
            </p>
          </Link>

          {weakSpots.length > 0 && (
            <Link
              to="/exams/new"
              search={{ weak: "1" }}
              className="block glass rounded-3xl p-4 space-y-1"
            >
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-orange-400" />
                <p className="flex-1 text-sm font-bold text-foreground">اختبرني في نقاط ضعفي</p>
              </div>
              <p className="text-[0.6875rem] text-muted-foreground">
                {weakSpots.length} موضعاً من اختباراتك السابقة:{" "}
                {weakSpots
                  .slice(0, 3)
                  .map((s) => `${s.surah_name} ${s.from_ayah}–${s.to_ayah}`)
                  .join(" · ")}
              </p>
            </Link>
          )}

          <section className="space-y-2">
            <h2 className="text-xs font-bold text-muted-foreground px-2">سجل الاختبارات</h2>
            {history.isPending ? (
              <div className="flex justify-center py-8">
                <Loader2
                  className="w-5 h-5 animate-spin text-primary"
                  aria-label="جارٍ تحميل السجل"
                />
              </div>
            ) : (history.data ?? []).length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">
                لا اختبارات بعد. ابدأ باختبار من سورة تحفظها.
              </p>
            ) : (
              (history.data ?? []).map((row) => (
                <div key={row.id} className="glass rounded-3xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4 text-primary shrink-0" />
                    <p className="flex-1 text-sm font-bold text-foreground">{row.scope_label}</p>
                    {row.result && (
                      <span className={`text-sm font-black ${masteryColor(row.result.mastery)}`}>
                        {row.result.percentage}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground flex-wrap">
                    <span className="rounded-full px-2 py-0.5 glass-strong">
                      {DIFFICULTY_LABEL[row.difficulty as Difficulty] ?? row.difficulty}
                    </span>
                    <span className="rounded-full px-2 py-0.5 glass-strong">
                      {row.mode === "practice" ? "تدريب" : "اختبار"}
                    </span>
                    <span>{row.question_count} سؤالاً</span>
                    <span className="mr-auto">{localDayOf(row.created_at)}</span>
                  </div>
                  {row.result ? (
                    <p className="text-[0.6875rem] text-muted-foreground">
                      النتيجة {row.result.score}/{row.result.possible} · المستوى{" "}
                      <span className={masteryColor(row.result.mastery)}>
                        {MASTERY_LABEL[row.result.mastery as MasteryLevel] ?? row.result.mastery}
                      </span>
                    </p>
                  ) : (
                    <p className="text-[0.6875rem] text-orange-400">لم يُسلَّم بعد</p>
                  )}
                </div>
              ))
            )}
          </section>
        </div>

        <BottomNav />
      </div>
    </PhoneFrame>
  );
}
