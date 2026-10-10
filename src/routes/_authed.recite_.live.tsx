import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { useSurahText } from "@/hooks/quran/use-surah-text";
import { useLiveRecite } from "@/hooks/recite/use-live-recite";
import { RecitationConsentStatus } from "@/components/zen/recite/RecitationConsent";
import { useRecitationConsent } from "@/hooks/recite/use-recitation-consent";
import { stripBasmala } from "@/lib/quran/basmala";
import { liveAlignment } from "@/lib/quran/live-recite";
import { quranRepository, toArabicDigits } from "@/lib/quran";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useT } from "@/lib/i18n";

/** التسميع المباشر (8.4): /recite/live?surah=112&from=1&to=4 */
export const Route = createFileRoute("/_authed/recite_/live")({
  head: () => ({ meta: [{ title: "التسميع المباشر — Zen" }] }),
  validateSearch: (s: Record<string, unknown>): { surah: number; from: number; to?: number } => {
    const n = (v: unknown, d: number) => {
      const x = Math.floor(Number(v));
      return Number.isFinite(x) && x > 0 ? x : d;
    };
    return {
      surah: Math.min(114, n(s.surah, 1)),
      from: n(s.from, 1),
      to: s.to === undefined ? undefined : n(s.to, 1),
    };
  },
  component: LiveReciteScreen,
});

const TONE = {
  ok: "text-primary",
  wrong: "text-destructive underline decoration-wavy",
  missed: "text-gold line-through",
  pending: "text-muted-foreground/60",
} as const;

function LiveReciteScreen() {
  const { surah, from, to } = Route.useSearch();
  const meta = quranRepository.getSurah(surah) ?? quranRepository.getSurah(1)!;
  const a = Math.min(meta.ayatCount, from);
  const b = Math.min(meta.ayatCount, Math.max(a, to ?? a + 4));
  const text = useSurahText(meta.id);
  const live = useLiveRecite();
  const consent = useRecitationConsent();
  const t = useT();
  // N-05: التسميع المباشر كله تحليل آلي، فهو خلف `recite_ai`.
  const { on } = useFeatureFlags();
  const aiOn = on("recite_ai");
  const begin = async () => {
    if (!aiOn) return;
    if (await consent.ensure()) await live.start();
  };

  const reference = useMemo(
    () =>
      text.data
        ? text.data.ayahs
            .filter((x) => x.n >= a && x.n <= b)
            .map((x) => stripBasmala(meta.id, x.n, x.t))
            .join(" ")
        : "",
    [text.data, a, b, meta.id],
  );
  const finished = !live.recording && !live.pending && live.state.chunks.length > 0;
  const al = useMemo(
    () => liveAlignment(reference, live.state, finished),
    [reference, live.state, finished],
  );

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col" dir="rtl">
        <header className="px-4 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/recite" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black">التسميع المباشر</h1>
            <p className="text-[0.6875rem] text-muted-foreground">
              سورة {meta.nameAr} · الآيات {toArabicDigits(a)}–{toArabicDigits(b)}
            </p>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
          {!aiOn && (
            <p
              role="alert"
              className="rounded-2xl border border-gold/40 bg-gold/10 p-3 text-[0.75rem] leading-relaxed"
              data-testid="live-recite-off"
            >
              {t("reciteAi.liveOff")}
            </p>
          )}
          <p className="text-[0.6875rem] text-muted-foreground">
            اقرأ من حفظك؛ تظهر الكلمات تباعاً: الأخضر صحيح، والأحمر خطأ، والمشطوب ساقط. النموذج يسمع
            فقط، والمطابقة بالنص المرجعي تتم على جهازك.
          </p>
          <section
            aria-label="نص التسميع"
            className="rounded-3xl border border-gold/20 bg-card/70 p-4 font-quran text-[1.2rem] leading-[2.3] text-center"
          >
            {text.status !== "ready" ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : (
              al.words.map((w) => (
                <span
                  key={w.index}
                  data-status={w.status}
                  title={w.heard ? `سُمع: ${w.heard}` : undefined}
                  className={TONE[w.status]}
                >
                  {/* الكلمات التي لم تُبلغ مخفية كي لا يقرأ الطالب من الشاشة */}
                  {w.status === "pending" && live.recording ? "…" : w.text}{" "}
                </span>
              ))
            )}
          </section>

          <div className="grid grid-cols-4 gap-2 text-center" aria-live="polite">
            <Count label="صحيح" n={al.counts.ok} />
            <Count label="خطأ" n={al.counts.wrong} />
            <Count label="ساقط" n={al.counts.missed} />
            <Count label="زائد" n={al.counts.extra} />
          </div>

          <RecitationConsentStatus />
          {consent.dialog}
          {live.recording ? (
            <button
              onClick={live.stop}
              className="w-full rounded-2xl bg-destructive text-destructive-foreground py-3 text-sm font-bold flex items-center justify-center gap-2"
            >
              <Square className="w-4 h-4" /> إنهاء التسميع
            </button>
          ) : (
            <button
              onClick={() => void begin()}
              disabled={text.status !== "ready" || live.pending}
              className="w-full rounded-2xl gradient-primary text-primary-foreground py-3 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {live.pending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
              {live.state.chunks.length ? "ابدأ من جديد" : "ابدأ التسميع"}
            </button>
          )}
          {live.error && (
            <p role="alert" className="text-xs text-destructive text-center">
              {live.error}
            </p>
          )}
          {finished && (
            <Link
              to="/mushaf/memorize"
              search={{ surah: meta.id, from: a, to: b }}
              className="block text-center text-xs text-primary underline"
            >
              راجع المقطع في وضع الحفظ
            </Link>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
}

function Count({ label, n }: { label: string; n: number }) {
  return (
    <div className="glass rounded-2xl py-2">
      <div className="text-base font-black tabular-nums">{toArabicDigits(n)}</div>
      <div className="text-[0.625rem] text-muted-foreground">{label}</div>
    </div>
  );
}
