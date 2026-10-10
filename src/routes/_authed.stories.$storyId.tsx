import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { AyahCard } from "@/components/zen/AyahCard";
import {
  Loader2,
  BookOpen,
  Sparkles,
  CheckCircle2,
  XCircle,
  Lightbulb,
  Library,
  ExternalLink,
  ChevronLeft,
  RotateCcw,
} from "lucide-react";
import { useSession } from "@/hooks/useSession";
import {
  getStory,
  isSeedStory,
  listStories,
  listStoryProgress,
  localStoryProgress,
  saveStoryProgress,
  type Story,
} from "@/lib/zen-lms";
import { storyAyahRefs, storySources } from "@/lib/stories-view";
import { useT, t as tStatic } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";

export const Route = createFileRoute("/_authed/stories/$storyId")({
  head: () => ({
    meta: [
      { title: tStatic("meta.story") },
      { name: "description", content: tStatic("meta.storyDesc") },
      { property: "og:title", content: tStatic("meta.story") },
      { property: "og:description", content: tStatic("meta.storyDesc") },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StoryScreen,
});

function StoryScreen() {
  usePagesDict();
  const { storyId } = Route.useParams();
  // مفتاح القصة يعيد حالة الشاشة (الحدث والإجابات) عند الانتقال إلى «القصة التالية».
  return <StoryBody key={storyId} storyId={storyId} />;
}

function StoryBody({ storyId }: { storyId: string }) {
  const t = useT();
  const { userId } = useSession();
  const [story, setStory] = useState<Story | null>(null);
  const [nextStory, setNextStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await getStory(storyId);
      if (!alive) return;
      setStory(s);
      setLoading(false);
      if (!s) return;
      // استئناف من آخر حدث وصل إليه القارئ.
      const mine = isSeedStory(s.id)
        ? localStoryProgress()
        : userId
          ? await listStoryProgress(userId).catch(() => [])
          : [];
      const p = mine.find((x) => x.story_id === s.id);
      if (alive && p && !p.completed && s.timeline.length) {
        setStep(Math.max(0, Math.min(p.last_step, s.timeline.length - 1)));
      }
      const all = await listStories().catch(() => [] as Story[]);
      const i = all.findIndex((x) => x.id === s.id);
      if (alive) setNextStory(i >= 0 ? (all[i + 1] ?? null) : null);
    })();
    return () => {
      alive = false;
    };
  }, [storyId, userId]);

  const timeline = story?.timeline ?? [];
  const quiz = story?.quiz ?? [];
  const total = timeline.length;
  const canSave = (s: Story) => !!userId || isSeedStory(s.id);

  const score = quiz.length
    ? Math.round((quiz.filter((q, i) => answers[i] === q.answer).length / quiz.length) * 100)
    : 0;

  const goTo = (next: number) => {
    setStep(next);
    if (story && canSave(story))
      void saveStoryProgress({ user_id: userId ?? "", story_id: story.id, last_step: next });
  };

  const finish = async () => {
    setSubmitted(true);
    if (story && canSave(story)) {
      await saveStoryProgress({
        user_id: userId ?? "",
        story_id: story.id,
        last_step: total,
        quiz_score: score,
        completed: true,
      });
    }
  };

  const retry = () => {
    setAnswers({});
    setSubmitted(false);
  };

  const refs = story ? storyAyahRefs(story) : [];
  const sources = story ? storySources(story, (k, v) => t(k, v)) : [];

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/stories" />
          <div className="flex-1">
            <h1 className="text-lg font-black text-foreground">
              {story?.title ?? t("storiesPage.fallbackTitle")}
            </h1>
            <p className="text-[0.6875rem] text-muted-foreground">{story?.prophet ?? ""}</p>
          </div>
          <BookOpen className="w-5 h-5 text-primary" />
        </header>

        {loading ? (
          <div className="flex-1 flex justify-center pt-16">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : !story ? (
          <p className="flex-1 text-center text-xs text-muted-foreground pt-16">
            {t("storiesPage.notFound")}
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-3">
            <div className="glass rounded-3xl p-4 space-y-2">
              <p className="text-xs leading-6 text-muted-foreground">{story.intro}</p>
              {(story.ulul_azm || story.people || story.place || story.mentions) && (
                <dl className="flex flex-wrap gap-1.5 text-[0.625rem]">
                  {story.ulul_azm && (
                    <span className="rounded-full bg-gold/15 text-gold font-bold px-2.5 py-1">
                      {t("storiesPage.ululAzm")}
                    </span>
                  )}
                  {story.people && (
                    <div className="rounded-full glass-strong px-2.5 py-1 flex gap-1">
                      <dt className="text-muted-foreground">{t("storiesPage.people")}:</dt>
                      <dd className="text-foreground">{story.people}</dd>
                    </div>
                  )}
                  {story.place && (
                    <div className="rounded-full glass-strong px-2.5 py-1 flex gap-1">
                      <dt className="text-muted-foreground">{t("storiesPage.place")}:</dt>
                      <dd className="text-foreground">{story.place}</dd>
                    </div>
                  )}
                  {!!story.mentions && (
                    <span className="rounded-full glass-strong px-2.5 py-1 text-foreground">
                      {t("storiesPage.mentions", { n: story.mentions })}
                    </span>
                  )}
                </dl>
              )}
            </div>

            <div className="glass rounded-3xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">{t("storiesPage.events")}</span>
                <span className="text-[0.6875rem] text-primary tabular-nums" dir="ltr">
                  {t("storiesPage.stepOf", { n: Math.min(step + 1, total), total })}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${total ? ((step + 1) / total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-sm leading-7 text-foreground min-h-20" aria-live="polite">
                {timeline[step]}
              </p>
              {total > 1 && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {timeline.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => goTo(i)}
                      aria-label={t("storiesPage.stepLabel", { n: i + 1 })}
                      aria-current={i === step ? "step" : undefined}
                      className={`h-2 rounded-full transition-all ${
                        i === step
                          ? "w-5 bg-primary"
                          : i < step
                            ? "w-2 bg-primary/50"
                            : "w-2 bg-muted"
                      }`}
                    />
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => goTo(Math.max(0, step - 1))}
                  disabled={step === 0}
                  className="flex-1 rounded-2xl glass-strong py-2.5 text-xs font-semibold disabled:opacity-60"
                >
                  {t("storiesPage.prev")}
                </button>
                <button
                  onClick={() => goTo(Math.min(total - 1, step + 1))}
                  disabled={step >= total - 1}
                  className="flex-1 rounded-2xl bg-primary text-primary-foreground py-2.5 text-xs font-semibold disabled:opacity-60"
                >
                  {t("storiesPage.next")}
                </button>
              </div>
            </div>

            {refs.length > 0 && (
              <div className="glass rounded-3xl p-4 space-y-2">
                <p className="text-xs font-bold text-foreground">{t("storiesPage.ayat")}</p>
                {refs.map(({ shown, full }, i) => (
                  <div key={i}>
                    {shown ? (
                      <AyahCard refr={shown} />
                    ) : (
                      <p className="text-[0.6875rem] text-muted-foreground">
                        {full.name} · {full.from}–{full.to}
                      </p>
                    )}
                    {shown && (
                      <Link
                        to="/mushaf/read"
                        search={{ surah: shown.surah, ayah: full.from }}
                        className="mt-1 inline-flex items-center gap-1 text-[0.625rem] text-primary font-semibold"
                      >
                        {shown.to < full.to
                          ? t("storiesPage.readFull", { from: full.from, to: full.to })
                          : t("storiesPage.openMushaf")}
                        <ChevronLeft className="w-3 h-3 rtl:rotate-0 ltr:rotate-180" />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}

            {story.vocabulary.length > 0 && (
              <div className="glass rounded-3xl p-4 space-y-1.5">
                <p className="text-xs font-bold text-foreground mb-1">
                  {t("storiesPage.vocabulary")}
                </p>
                {story.vocabulary.map((v, i) => (
                  <p key={i} className="text-[0.6875rem] text-muted-foreground">
                    <span className="text-primary font-bold">{v.word}</span> — {v.meaning}
                  </p>
                ))}
              </div>
            )}

            {!!story.lessons?.length && (
              <div className="glass rounded-3xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 mb-1">
                  <Lightbulb className="w-4 h-4 text-gold" />
                  <p className="text-xs font-bold text-foreground">{t("storiesPage.lessons")}</p>
                </div>
                <ul className="space-y-1.5 list-disc ps-4">
                  {story.lessons.map((l, i) => (
                    <li key={i} className="text-[0.6875rem] leading-5 text-muted-foreground">
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {quiz.length > 0 && (
              <div className="glass rounded-3xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-gold" />
                  <p className="text-xs font-bold text-foreground">{t("storiesPage.quiz")}</p>
                </div>
                {quiz.map((q, qi) => (
                  <div key={qi} className="space-y-1.5">
                    <p className="text-xs text-foreground">
                      {qi + 1}. {q.q}
                    </p>
                    <div className="grid grid-cols-1 gap-1.5">
                      {q.options.map((o, oi) => {
                        const chosen = answers[qi] === oi;
                        const correct = submitted && oi === q.answer;
                        const wrong = submitted && chosen && oi !== q.answer;
                        return (
                          <button
                            key={oi}
                            aria-pressed={chosen}
                            onClick={() => !submitted && setAnswers((a) => ({ ...a, [qi]: oi }))}
                            className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-[0.6875rem] text-right ${
                              correct
                                ? "bg-primary/20 text-primary font-bold"
                                : wrong
                                  ? "bg-destructive/15 text-destructive"
                                  : chosen
                                    ? "bg-primary/10 text-foreground"
                                    : "glass-strong text-muted-foreground"
                            }`}
                          >
                            {correct && <CheckCircle2 className="w-3.5 h-3.5" />}
                            {wrong && <XCircle className="w-3.5 h-3.5" />}
                            {o}
                          </button>
                        );
                      })}
                    </div>
                    {submitted && q.explain && (
                      <p className="text-[0.625rem] leading-5 text-muted-foreground rounded-xl bg-muted/40 px-2.5 py-1.5">
                        {q.explain}
                      </p>
                    )}
                  </div>
                ))}
                {!submitted ? (
                  <button
                    onClick={finish}
                    disabled={Object.keys(answers).length < quiz.length}
                    className="w-full rounded-2xl bg-gold text-gold-foreground py-2.5 text-xs font-bold disabled:opacity-60"
                  >
                    {t("storiesPage.showResult")}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-center text-xs font-bold text-primary">
                      {t("storiesPage.score", { score })}
                    </p>
                    {score < 100 && (
                      <button
                        type="button"
                        onClick={retry}
                        className="w-full rounded-2xl glass-strong py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> {t("storiesPage.retry")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {sources.length > 0 && (
              <div className="glass rounded-3xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 mb-1">
                  <Library className="w-4 h-4 text-primary" />
                  <p className="text-xs font-bold text-foreground">{t("storiesPage.sources")}</p>
                </div>
                {sources.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[0.6875rem] text-primary"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span className="line-clamp-1">{s.title}</span>
                  </a>
                ))}
                <p className="pt-1 text-[0.625rem] leading-5 text-muted-foreground">
                  {t("storiesPage.note")}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Link
                to="/stories"
                className="flex-1 rounded-2xl glass-strong py-2.5 text-center text-xs font-semibold"
              >
                {t("storiesPage.allStories")}
              </Link>
              {nextStory && (
                <Link
                  to="/stories/$storyId"
                  params={{ storyId: nextStory.id }}
                  className="flex-[2] rounded-2xl bg-primary text-primary-foreground py-2.5 px-3 text-center text-xs font-semibold line-clamp-1"
                >
                  {t("storiesPage.nextStory", { title: nextStory.prophet })}
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </PhoneFrame>
  );
}
