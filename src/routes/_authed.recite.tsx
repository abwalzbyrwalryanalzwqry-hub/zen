import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { BottomNav } from "@/components/zen/BottomNav";
import { Recorder, type RecorderResult } from "@/components/zen/Recorder";
import { Loader2, Pause, Radio, Play, Send, Sparkles, Waves } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useT } from "@/lib/i18n";
import { SURAHS, ayahAudioUrl } from "@/lib/quran-meta";
import { loadQuranCorpus } from "@/lib/exam/corpus";
import { diffWords, type DiffOp } from "@/lib/tajweed-diff";
import { TAJWEED_HINTS_DISCLAIMER, tajweedHints, type TajweedHint } from "@/lib/tajweed-hints";
import { coachRecitation, transcribeRecitation } from "@/lib/recitation-client";
import { RecitationConsentStatus } from "@/components/zen/recite/RecitationConsent";
import { useRecitationConsent } from "@/hooks/recite/use-recitation-consent";
import { submitPracticeToTeacher } from "@/lib/zen-lms";
import { uploadPractice } from "@/lib/recite/practice-upload";

export const Route = createFileRoute("/_authed/recite")({
  head: () => ({
    meta: [
      { title: "التسميع الذاتي — Zen" },
      {
        name: "description",
        content:
          "استمع لقارئ موثوق، سجّل تلاوتك، وقارنها بالنص القرآني كلمة بكلمة قبل إرسالها للمعلم.",
      },
      { property: "og:title", content: "التسميع الذاتي — Zen" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ReciteScreen,
});

type Ayah = { n: number; text: string };
type Result = {
  sessionId: string;
  transcript: string;
  score: number;
  ops: DiffOp[];
  weak: string[];
  hints: TajweedHint[];
  coach: string | null;
};

function ReciteScreen() {
  const { userId } = useSession();
  const transcribe = transcribeRecitation;
  const consent = useRecitationConsent();
  const coach = coachRecitation;
  const t = useT();
  // N-05: التحليل الآلي خلف `recite_ai` (مطفأ حتى اجتياز بوابة التقييم)؛ بدونه يُرفع التسجيل ويُرسل للمعلّم مباشرة.
  const { on } = useFeatureFlags();
  const aiOn = on("recite_ai");

  const [surah, setSurah] = useState(1);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(7);
  const [ayat, setAyat] = useState<Ayah[]>([]);
  const [loadingText, setLoadingText] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [playing, setPlaying] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [rec, setRec] = useState<RecorderResult | null>(null);
  const [stage, setStage] = useState<null | "upload" | "transcribe" | "coach">(null);
  const [result, setResult] = useState<Result | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const meta = SURAHS.find((s) => s.n === surah) ?? SURAHS[0];

  // سورة أخرى ⇒ نطاق افتراضي، ونطاق آخر ⇒ نص جديد بلا نتيجة سابقة — أثناء العرض لا في أثر (M12).
  const [rangeFor, setRangeFor] = useState({ surah, from, to });
  if (rangeFor.surah !== surah) {
    setRangeFor({ surah, from: 1, to: Math.min(7, meta.ayahs) });
    setFrom(1);
    setTo(Math.min(7, meta.ayahs));
    setLoadingText(true);
    setErr(null);
    setResult(null);
  } else if (rangeFor.from !== from || rangeFor.to !== to) {
    setRangeFor({ surah, from, to });
    setLoadingText(true);
    setErr(null);
    setResult(null);
  }

  // النص من المتن المحلي الموثَّق نفسه الذي يقارن به الخادم — يعمل دون شبكة.
  useEffect(() => {
    let alive = true;
    loadQuranCorpus()
      .then((corpus) => {
        if (!alive) return;
        const list = corpus
          .surah(surah)
          .slice(from - 1, to)
          .map((a) => ({ n: a.ayah, text: a.text }));
        setAyat(list);
      })
      .catch(() => alive && setErr("تعذّر تحميل نص المصحف."))
      .finally(() => alive && setLoadingText(false));
    return () => {
      alive = false;
    };
  }, [surah, from, to]);

  const playAyah = (n: number) => {
    if (!audioRef.current) return;
    if (playing === n) {
      audioRef.current.pause();
      setPlaying(null);
      return;
    }
    audioRef.current.src = ayahAudioUrl(surah, n);
    void audioRef.current.play();
    setPlaying(n);
  };

  const analyze = async () => {
    if (!rec || !userId || ayat.length === 0) return;
    if (!(await consent.ensure())) return;
    setErr(null);
    setSent(false);
    try {
      setStage("upload");
      const sessionId = await uploadPractice(userId, rec, { surahName: meta.name, from, to });

      // التفريغ والدرجة يُحسبان ويُحفظان على الخادم من الصوت المرفوع فعلاً.
      setStage("transcribe");
      const t = await transcribe({ data: { sessionId } });
      const base: Result = {
        sessionId,
        transcript: t.transcript,
        score: t.score,
        ops: diffWords(t.reference, t.transcript),
        weak: t.weakSpots,
        hints: tajweedHints(t.reference),
        coach: null,
      };
      setResult(base);

      setStage("coach");
      try {
        const c = await coach({ data: { sessionId } });
        setResult({ ...base, coach: c.text });
      } catch {
        // الملاحظات إضافة؛ النتيجة الأساسية ظاهرة ومحفوظة.
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر تحليل التلاوة.");
    } finally {
      setStage(null);
    }
  };

  const sendOnly = async () => {
    if (!rec || !userId) return;
    setErr(null);
    setSent(false);
    try {
      setStage("upload");
      const sessionId = await uploadPractice(userId, rec, { surahName: meta.name, from, to });
      await submitPracticeToTeacher(sessionId);
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("reciteAi.sendOnly"));
    } finally {
      setStage(null);
    }
  };

  const sendToTeacher = async () => {
    if (!result) return;
    setSending(true);
    setErr(null);
    try {
      await submitPracticeToTeacher(result.sessionId);
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر الإرسال.");
    } finally {
      setSending(false);
    }
  };

  const busy = stage !== null;
  const stageLabel =
    stage === "upload"
      ? "جارٍ رفع التسجيل…"
      : stage === "transcribe"
        ? "جارٍ تفريغ التلاوة ومقارنتها…"
        : stage === "coach"
          ? "جارٍ إعداد الملاحظات…"
          : "تحليل التلاوة";

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">التسميع الذاتي</h1>
            <p className="text-[0.6875rem] text-muted-foreground">
              استمع، سجّل، وقارن تلاوتك بالنص
            </p>
          </div>
          <Waves className="w-5 h-5 text-primary" />
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          {aiOn && (
            <Link
              to="/recite/live"
              search={{ surah, from, to }}
              className="glass rounded-3xl p-4 flex items-center gap-3"
            >
              <Radio className="w-5 h-5 text-primary" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">التسميع المباشر</p>
                <p className="text-[0.6875rem] text-muted-foreground">
                  اقرأ من حفظك وتُطابَق الكلمات أثناء التلاوة
                </p>
              </div>
            </Link>
          )}
          <div className="glass rounded-3xl p-4 space-y-3">
            <label htmlFor="recite-surah" className="block text-[0.6875rem] text-muted-foreground">
              السورة
            </label>
            <select
              id="recite-surah"
              value={surah}
              onChange={(e) => setSurah(Number(e.target.value))}
              disabled={busy}
              className="w-full h-11 rounded-2xl glass-strong px-3 text-sm bg-transparent outline-none"
            >
              {SURAHS.map((s) => (
                <option key={s.n} value={s.n} className="bg-background">
                  {s.n}. {s.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="recite-from"
                  className="block text-[0.6875rem] text-muted-foreground mb-1"
                >
                  من آية
                </label>
                <input
                  id="recite-from"
                  type="number"
                  min={1}
                  max={meta.ayahs}
                  value={from}
                  disabled={busy}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(meta.ayahs, Number(e.target.value) || 1));
                    setFrom(v);
                    if (to < v) setTo(v);
                  }}
                  className="w-full h-11 rounded-2xl glass-strong px-3 text-sm bg-transparent outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="recite-to"
                  className="block text-[0.6875rem] text-muted-foreground mb-1"
                >
                  إلى آية
                </label>
                <input
                  id="recite-to"
                  type="number"
                  min={from}
                  max={meta.ayahs}
                  value={to}
                  disabled={busy}
                  onChange={(e) =>
                    setTo(Math.max(from, Math.min(meta.ayahs, Number(e.target.value) || from)))
                  }
                  className="w-full h-11 rounded-2xl glass-strong px-3 text-sm bg-transparent outline-none"
                />
              </div>
            </div>
          </div>

          <audio ref={audioRef} onEnded={() => setPlaying(null)} className="hidden" />

          <div className="glass rounded-3xl p-4 space-y-3">
            <p className="text-[0.6875rem] text-muted-foreground">
              النص مع تلاوة الشيخ مشاري العفاسي
            </p>
            {loadingText ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : (
              ayat.map((a) => (
                <div key={a.n} className="flex items-start gap-3">
                  <button
                    onClick={() => playAyah(a.n)}
                    className="mt-1 w-9 h-9 shrink-0 rounded-xl glass-strong flex items-center justify-center text-primary"
                    aria-label={`استماع للآية ${a.n}`}
                  >
                    {playing === a.n ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <p className="text-[1.0625rem] leading-[2.2] text-foreground flex-1">
                    {a.text} <span className="text-gold text-xs">﴿{a.n}﴾</span>
                  </p>
                </div>
              ))
            )}
          </div>

          <Recorder
            onReady={(r) => {
              setRec(r);
              setResult(null);
              setSent(false);
            }}
            disabled={busy}
          />

          {aiOn ? (
            <>
              <button
                onClick={analyze}
                disabled={!rec || busy || ayat.length === 0}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {stageLabel}
              </button>
              <RecitationConsentStatus />
              {consent.dialog}
            </>
          ) : (
            <>
              <button
                onClick={() => void sendOnly()}
                disabled={!rec || busy || sent}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-60"
                data-testid="recite-send-only"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {busy ? t("reciteAi.sending") : t("reciteAi.sendOnly")}
              </button>
              <p className="text-[0.6875rem] text-muted-foreground text-center">
                {sent ? t("reciteAi.sent") : t("reciteAi.offNote")}
              </p>
            </>
          )}

          {err && (
            <p role="alert" className="text-xs text-destructive text-center">
              {err}
            </p>
          )}

          {result && (
            <div className="glass-strong rounded-3xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">نتيجة المطابقة</span>
                <span className="text-2xl font-black text-primary">{result.score}%</span>
              </div>

              <p className="text-[0.6875rem] text-muted-foreground">
                النص مع مواضع الاختلاف (<span className="text-gold">كلمة مختلفة</span> ·{" "}
                <span className="text-destructive">كلمة ناقصة</span>)
              </p>
              <p className="text-[1.0625rem] leading-[2.2]">
                {result.ops.map((o, i) =>
                  o.op === "match" ? (
                    <span key={i} className="text-foreground">
                      {o.ref}{" "}
                    </span>
                  ) : o.op === "wrong" ? (
                    <span key={i} className="text-gold underline decoration-dotted">
                      {o.ref}{" "}
                    </span>
                  ) : o.op === "missing" ? (
                    <span key={i} className="text-destructive line-through">
                      {o.ref}{" "}
                    </span>
                  ) : null,
                )}
              </p>

              {result.weak.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[0.6875rem] text-muted-foreground">مواضع التدريب المقترحة</p>
                  {result.weak.map((w, i) => (
                    <p key={i} className="text-sm text-foreground/90 rounded-xl glass px-3 py-2">
                      {w}
                    </p>
                  ))}
                </div>
              )}

              {result.hints.length > 0 && <TajweedHintsList result={result} />}

              {result.coach && (
                <div className="space-y-1">
                  <p className="text-[0.6875rem] text-muted-foreground">ملاحظات مساعد Zen</p>
                  <p className="text-sm leading-7 whitespace-pre-line text-foreground/90">
                    {result.coach}
                  </p>
                </div>
              )}

              <details className="text-[0.6875rem] text-muted-foreground">
                <summary>ما سمعه النظام من تلاوتك</summary>
                <p className="pt-2 text-sm leading-7 text-foreground/80">{result.transcript}</p>
              </details>

              <p className="text-[0.625rem] text-muted-foreground">
                التحليل الآلي مساعدة للتدريب وليس حكماً على التلاوة؛ المعلّم هو من يعتمد.
              </p>

              <button
                onClick={sendToTeacher}
                disabled={sending || sent}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gold text-gold-foreground py-3 text-sm font-semibold disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {sent ? "أُرسل إلى معلّمك للاعتماد" : "إرسال إلى معلّمي للاعتماد"}
              </button>
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </PhoneFrame>
  );
}

/** ملاحظات تجويد إرشادية على النص المرجعي، مع تقديم مواضع الكلمات التي اختلفت. */
function TajweedHintsList({ result }: { result: Result }) {
  const [all, setAll] = useState(false);
  const differed = new Set(
    result.ops.filter((o) => o.op === "wrong" || o.op === "missing").map((o) => o.i),
  );
  const sorted = [...result.hints].sort(
    (a, b) => Number(differed.has(b.index)) - Number(differed.has(a.index)) || a.index - b.index,
  );
  const shown = all ? sorted : sorted.slice(0, 6);
  return (
    <div className="space-y-1.5">
      <p className="text-[0.6875rem] text-muted-foreground">ملاحظات تجويد إرشادية</p>
      {shown.map((h) => (
        <div key={`${h.index}-${h.rule}`} className="rounded-xl glass px-3 py-2">
          <p className="text-sm text-foreground">
            <span className="font-semibold">{h.word}</span>
            <span className="mx-1.5 text-[0.6875rem] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
              {h.label}
            </span>
            {differed.has(h.index) && (
              <span className="text-[0.625rem] text-gold">موضع اختلاف</span>
            )}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground leading-5">{h.detail}</p>
        </div>
      ))}
      {sorted.length > 6 && (
        <button
          onClick={() => setAll((v) => !v)}
          className="text-[0.6875rem] text-primary underline"
        >
          {all ? "عرض أقل" : `عرض الكل (${sorted.length})`}
        </button>
      )}
      <p className="text-[0.625rem] text-muted-foreground/80">{TAJWEED_HINTS_DISCLAIMER}</p>
    </div>
  );
}
