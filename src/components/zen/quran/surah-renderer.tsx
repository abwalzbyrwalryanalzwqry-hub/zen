import { Icon } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { toArabicDigits } from "@/lib/quran";
import { useReadingPrefs } from "@/lib/quran/reading-prefs";
import { BASMALA, hasBasmalaHeader } from "@/lib/quran/basmala";
import type { AyahText, SurahText } from "@/lib/quran/text-types";
import { isSajdah, markerAtAyah } from "@/lib/quran/page-math";
import { friendlyLoadError, markerLabel } from "@/lib/quran/reader-labels";
import { useT } from "@/lib/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { ensureMushafDict } from "@/lib/quran/mushaf-i18n";

// قاموس القارئ الكسول: يُضاف متزامناً قبل أول رسم.
void ensureMushafDict();

/** مدة بقاء تمييز الآية المستهدفة (من البحث أو العلامات) قبل أن يخبو. */
const ACTIVE_FADE_MS = 2600;

interface Props {
  surahId: number;
  surahNameAr: string;
  state:
    | { status: "loading"; data: undefined; error: undefined }
    | { status: "ready"; data: SurahText; error: undefined }
    | { status: "error"; data: undefined; error: Error };
  onRetry: () => void;
  /** Ayah to highlight and scroll into view. */
  activeAyah?: number | null;
  /** Tapping an ayah opens the actions sheet in the reader. */
  onAyahTap?: (ayah: AyahText) => void;
  /** Ayah currently being recited — highlighted in emerald. */
  playingAyah?: number | null;
}

/**
 * Renders a Surah's Uthmani text inside the reading container.
 * Text comes from the QuranTextService — never hardcoded.
 */
export function SurahRenderer({
  surahId,
  surahNameAr,
  state,
  onRetry,
  activeAyah,
  onAyahTap,
  playingAyah,
}: Props) {
  // حركة الظهور تُعاد عند تغيّر السورة: المفتاح هو رقمها (إعادة تركيب الحاوية).
  const t = useT();
  const { style } = useReadingPrefs();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // التمييز الذهبي للآية المستهدفة يخبو بعد لحظات حتى لا يبقى طوال القراءة.
  const [fadedFor, setFadedFor] = useState<string | null>(null);
  const activeKey = activeAyah ? `${surahId}:${activeAyah}` : null;
  useEffect(() => {
    if (!activeKey) return;
    const id = window.setTimeout(() => setFadedFor(activeKey), ACTIVE_FADE_MS);
    return () => window.clearTimeout(id);
  }, [activeKey]);
  const showActive = activeKey !== null && fadedFor !== activeKey;

  // الآيات مجمّعة بصفحاتها: كل صفحة فقرة يتخطى المتصفح رسمها خارج الشاشة (content-visibility)،
  // فلا تُرسم البقرة كلها (٦٥ ألف بكسل) مع كل تمرير، ويظهر فاصل رقم الصفحة بين الصفحات.
  const groups = useMemo(() => {
    if (state.status !== "ready") return [];
    const out: { page: number; ayahs: AyahText[] }[] = [];
    for (const a of state.data.ayahs) {
      const last = out[out.length - 1];
      if (last && last.page === a.p) last.ayahs.push(a);
      else out.push({ page: a.p, ayahs: [a] });
    }
    return out;
  }, [state]);

  // Bring the requested (or currently recited) ayah into view.
  const focusAyah = playingAyah ?? activeAyah ?? null;
  // نص السورة نفسه لا حالته فقط: عند تبديل السورة تبقى الحالة «جاهزة» ويتغيّر النص، فلو اعتمد
  // الأثر على الحالة لبحث عن الآية في نص السورة السابقة (فلا يصل رابط ?ayah=255 إلى آية الكرسي).
  const readyData = state.status === "ready" ? state.data : null;
  useEffect(() => {
    if (!focusAyah || !readyData) return;
    const node = containerRef.current?.querySelector(`[data-ayah="${focusAyah}"]`);
    if (!node) return;
    // أثناء التلاوة: الآية في الوسط بسلاسة.
    if (playingAyah) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // الاستئناف أو الانتقال: الآية في أعلى منطقة القراءة فوراً. صفحات السورة خارج الشاشة تُقدَّر
    // أطوالها (content-visibility) ثم تُرسم بعد القفز فتزيح الآية، فنعيد الضبط حتى يستقر التخطيط.
    const align = () => node.scrollIntoView({ behavior: "instant", block: "start" });
    align();
    let frame = requestAnimationFrame(() => {
      align();
      frame = requestAnimationFrame(align);
    });
    const timers = [150, 400].map((ms) => window.setTimeout(align, ms));
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [focusAyah, playingAyah, readyData, surahId]);

  if (state.status === "loading") {
    return <ReaderLoading nameAr={surahNameAr} />;
  }

  if (state.status === "error") {
    return <ReaderError error={state.error} onRetry={onRetry} />;
  }

  // الفاتحة: البسملة آيتها الأولى. التوبة: بلا بسملة. غيرهما: البسملة
  // فُصلت عن الآية الأولى في خدمة النص وتُعرض هنا رأساً مزخرفاً.
  const ayahs = state.data.ayahs;
  const showBasmalaHeader = hasBasmalaHeader(surahId) && ayahs.length > 0;

  return (
    <div key={surahId} ref={containerRef} className="animate-fade-up">
      {/* Ornamental surah header */}
      <div className="mb-7 flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-3">
          <span className="h-px w-10 bg-gold/40" />
          <span className="font-display text-[0.6875rem] uppercase tracking-[0.3em] text-gold">
            {t("mushafReader.surahWord")}
          </span>
          <span className="h-px w-10 bg-gold/40" />
        </div>
        <div className="font-display text-3xl font-medium leading-none">{surahNameAr}</div>
        {showBasmalaHeader && (
          <div
            className="mt-5 text-[1.35em] leading-[2.1] text-foreground/90"
            style={{
              fontFamily: style.fontFamily,
              fontSize: `${(style.fontSizeRem * 0.92).toFixed(3)}rem`,
            }}
            lang="ar"
          >
            {BASMALA}
          </div>
        )}
      </div>

      {/* Verses — flowing mushaf-style paragraphs, one per Mushaf page */}
      <div className="mx-auto" style={{ maxWidth: style.maxWidth }}>
        {groups.map((g, gi) => (
          <div key={g.page} className="surah-page-group">
            {gi > 0 && (
              <div
                className="my-3 flex items-center gap-2 text-[0.625rem] text-muted-foreground tabular-nums"
                aria-hidden="true"
              >
                <span className="h-px flex-1 bg-border/60" />
                {t("mushafReader.meta.page", { n: toArabicDigits(g.page) })}
                <span className="h-px flex-1 bg-border/60" />
              </div>
            )}
            <p
              className="text-justify text-foreground"
              style={{
                fontFamily: style.fontFamily,
                fontSize: `${style.fontSizeRem}rem`,
                lineHeight: style.lineHeight,
                textAlignLast: gi === groups.length - 1 ? "center" : "start",
                wordSpacing: "0.06em",
                paddingInline: "0.15rem",
              }}
              lang="ar"
            >
              {g.ayahs.map((a) => {
                const isActive = showActive && activeAyah === a.n;
                const isPlaying = playingAyah === a.n;
                // box-decoration-break: كل سطر من الآية الممتدة يأخذ خلفيته كاملة بلا إطار مقطوع.
                const highlight = isPlaying
                  ? "ayah-highlight bg-primary/15"
                  : isActive
                    ? "ayah-highlight bg-gold/20"
                    : "";
                const marker = markerAtAyah(surahId, a.n);
                const sajdah = isSajdah(surahId, a.n);
                return (
                  <span
                    key={a.n}
                    data-ayah={a.n}
                    role={onAyahTap ? "button" : undefined}
                    tabIndex={onAyahTap ? 0 : undefined}
                    onClick={onAyahTap ? () => onAyahTap(a) : undefined}
                    onKeyDown={
                      onAyahTap
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onAyahTap(a);
                            }
                          }
                        : undefined
                    }
                    aria-label={t("mushafReader.ayahAria", {
                      surah: surahNameAr,
                      ayah: toArabicDigits(a.n),
                    })}
                    aria-current={isPlaying ? "true" : undefined}
                    className={`inline scroll-mt-28 transition-colors duration-700 ${highlight} ${
                      onAyahTap ? "cursor-pointer" : ""
                    }`}
                  >
                    {marker && !(marker.kind === "juz" && marker.no === 1) && (
                      <span
                        className="mx-1 inline-block select-none rounded-full border border-gold/40 bg-gold/10 px-[0.6em] align-middle font-sans text-[0.42em] font-medium leading-[1.9] text-gold"
                        aria-hidden="true"
                      >
                        ۞ {markerLabel(marker)}
                      </span>
                    )}
                    <span>{a.t}</span>
                    <span
                      className="mx-[0.3em] inline-flex h-[2.3em] min-w-[2.3em] select-none items-center justify-center rounded-full border border-gold/50 bg-gold/15 px-[0.3em] align-middle font-sans text-[0.5em] font-medium leading-none tabular-nums text-gold"
                      aria-hidden="true"
                    >
                      {toArabicDigits(a.n)}
                    </span>
                    {sajdah && (
                      <span
                        className="ms-0.5 inline-block select-none rounded-full border border-gold/40 px-[0.6em] align-middle font-sans text-[0.42em] leading-[1.9] text-gold"
                        aria-hidden="true"
                      >
                        ۩ {t("mushafReader.meta.sajdah")}
                      </span>
                    )}{" "}
                  </span>
                );
              })}
            </p>
          </div>
        ))}
      </div>

      {/* End-of-surah ornament */}
      <div className="mt-10 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-gold/70">
          <span className="h-px w-8 bg-gold/40" />
          <Icon d={icons.sparkle} size={14} />
          <span className="h-px w-8 bg-gold/40" />
        </div>
        <p className="text-[0.6875rem] text-muted-foreground">
          {t("mushafReader.surahEnd", { surah: surahNameAr, n: toArabicDigits(ayahs.length) })}
        </p>
      </div>
    </div>
  );
}

function ReaderLoading({ nameAr }: { nameAr: string }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[0.625rem] font-medium uppercase tracking-[0.3em] text-gold">
        {t("mushafReader.loading")}
      </span>
      <div className="font-display text-lg text-foreground/80">
        {t("mushafReader.surahName", { surah: nameAr })}
      </div>
      <div className="mt-2 grid w-full gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-4 w-full animate-pulse rounded-full bg-muted/70"
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function ReaderError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Icon d={icons.info} size={20} />
      </span>
      <div className="font-display text-base">{t("mushafReader.error.surah")}</div>
      <p
        className="max-w-[20rem] text-[0.6875rem] leading-relaxed text-muted-foreground"
        title={error.message}
      >
        {friendlyLoadError(error)}
      </p>
      <button
        onClick={onRetry}
        className="mt-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-[0.75rem] font-medium text-primary transition hover:bg-primary/15 active:scale-95"
      >
        {t("mushafReader.error.retry")}
      </button>
    </div>
  );
}
