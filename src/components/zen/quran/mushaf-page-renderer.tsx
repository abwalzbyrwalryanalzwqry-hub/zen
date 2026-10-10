import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { toArabicDigits } from "@/lib/quran";
import { bareSurahNameAr, juzLabelAr } from "@/lib/quran/page-labels";
import {
  isAyahLine,
  isOpeningPage,
  MUSHAF15_FONT,
  QPC_BASMALA,
  type Mushaf15Line,
} from "@/lib/quran/mushaf15";
import { SURAH_META } from "@/lib/quran/metadata";
import { markersOnPage, type PageMarker } from "@/lib/quran/page-math";
import { friendlyLoadError, markerLabel } from "@/lib/quran/reader-labels";
import type { BookmarkTag } from "@/lib/quran/bookmarks";
import { useT } from "@/lib/i18n";
import { Sep } from "@/components/mushaf/reader/Sep";
import type { MushafPageState } from "@/hooks/quran/use-mushaf-page";
import type { AyahText } from "@/lib/quran/text-types";
import { ensureMushafDict } from "@/lib/quran/mushaf-i18n";

// قاموس القارئ الكسول: يُضاف متزامناً قبل أول رسم.
void ensureMushafDict();

type AyahTap = (surahId: number, ayah: AyahText) => void;

interface Props {
  page: number;
  state: MushafPageState;
  onRetry: () => void;
  /** نقر آية في الصفحة: تفسير، حفظ، تلاوة، مشاركة. */
  onAyahTap?: AyahTap;
  /** الآية المحددة حالياً ("سورة:آية") لتظليلها. */
  selectedKey?: string;
  /** الآيات المعلَّمة ("سورة:آية") ولون علامة كلٍّ منها. */
  markedTags?: ReadonlyMap<string, BookmarkTag>;
  /** تكبير الصفحة (١ = عرض الشاشة). الأكبر يتمرّر أفقياً بدل تصغير الخط. */
  zoom?: number;
}

/** خلفية الآية المعلَّمة بلون وسم العلامة. */
const TAG_BG: Record<BookmarkTag, string> = {
  tadabbur: "bg-gold/15",
  hifz: "bg-amber-400/25",
  dua: "bg-sky-500/15",
  amal: "bg-emerald-500/15",
  review: "bg-rose-500/15",
};

/**
 * صفحة من مصحف المدينة (١٥ سطراً) كما في المطبوع: كل سطر يحمل الكلمات نفسها
 * التي في الطبعة الورقية، مضبوطاً على عرض الصفحة بخط مجمع الملك فهد (حفص).
 *
 * حجم الخط يُشتق من عرض الصفحة (لا من إعداد حجم الخط) حتى تبقى الأسطر
 * مطابقة للمطبوع؛ وقد تُصغَّر بعض الأسطر الطويلة قليلاً لتتسع.
 */
export function MushafPageRenderer({
  page,
  state,
  onRetry,
  onAyahTap,
  selectedKey,
  markedTags,
  zoom = 1,
}: Props) {
  const t = useT();
  if (state.status === "loading") return <PageLoading page={page} />;
  if (state.status === "error") return <PageError error={state.error} onRetry={onRetry} />;

  const { segments, juz, hizb, layout } = state.data;
  const headSurahs = segments.map((s) => bareSurahNameAr(s.nameAr)).join("، ");

  return (
    <div className="flex w-full flex-col" dir="rtl">
      {/* الترويسة: السورة على جانب، والجزء والحزب على الآخر */}
      <div className="flex items-center justify-between gap-3 pb-2 text-[0.75rem] text-muted-foreground">
        <span className="truncate font-display">{headSurahs}</span>
        <span className="shrink-0 font-display">
          {juzLabelAr(juz)}
          {hizb ? (
            <>
              <Sep />
              {t("mushafReader.meta.hizb", { n: toArabicDigits(hizb) })}
            </>
          ) : null}
        </span>
      </div>

      <PageLines
        key={page}
        page={page}
        lines={layout.l}
        segments={segments}
        onAyahTap={onAyahTap}
        selectedKey={selectedKey}
        markedTags={markedTags}
        zoom={zoom}
      />

      <div className="flex justify-center pt-2">
        <PageNumberPlate page={page} />
      </div>
    </div>
  );
}

/* ---------------- الأسطر ---------------- */

/**
 * عرض الصفحة بوحدة em. أسطر V1 بخط الحفص تتراوح بين ١٢٫٦ و٢٢٫٧em (الوسيط ١٦٫٣)؛
 * ١٨٫٤ يُدخل نحو ٩٠٪ منها كاملة، والباقي يضيق فراغه ثم يصغر خطه قليلاً.
 */
const LINE_EM = 18.4;
const ROW_EM = 1.95;

function PageLines({
  page,
  lines,
  segments,
  onAyahTap,
  selectedKey,
  markedTags,
  zoom,
}: {
  page: number;
  lines: Mushaf15Line[];
  segments: MushafPageStateReady["segments"];
  onAyahTap?: AyahTap;
  selectedKey?: string;
  markedTags?: ReadonlyMap<string, BookmarkTag>;
  zoom: number;
}) {
  const t = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const opening = isOpeningPage(page);

  // عرض الصفحة يحدد حجم الخط.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fontPx = width ? Math.max(12, Math.min(64, (width * zoom) / LINE_EM)) : 0;

  // علامات الهامش: بداية جزء/حزب/ربع في سطر، وموضع السجدة — كما في هامش المصحف المطبوع.
  const marginMarks = useMemo(() => {
    const marks = markersOnPage(page);
    const byLine = new Map<number, { start?: PageMarker; sajdah?: PageMarker }>();
    lines.forEach((line, i) => {
      if (!isAyahLine(line)) return;
      for (const m of marks) {
        if (m.surah !== line.s) continue;
        const idx = line.w.findIndex(([a]) => a === m.ayah);
        if (idx < 0) continue;
        const entry = byLine.get(i) ?? {};
        if (m.kind === "sajdah") {
          // السجدة عند علامة نهاية الآية؛ البداية عند أول كلمة منها.
          if (line.w.some(([a, text]) => a === m.ayah && !text)) entry.sajdah = m;
        } else if (idx === 0 ? !prevLineHas(lines, i, m.ayah, m.surah) : true) {
          entry.start ??= m;
        }
        byLine.set(i, entry);
      }
    });
    return byLine;
  }, [lines, page]);

  // تصغير أي سطر أطول من العرض — بعد تحميل الخط، وعند تغير العرض.
  const fitLines = useCallback(() => {
    const box = boxRef.current;
    if (!box || !fontPx) return;
    box.querySelectorAll<HTMLElement>("[data-line]").forEach((line) => {
      line.style.fontSize = "";
      line.style.columnGap = "";
      if (line.scrollWidth <= line.clientWidth + 0.5) return;
      // أولاً: تضييق الفراغ بين الكلمات، ثم تصغير الخط إن لم يكفِ.
      line.style.columnGap = "0.08em";
      const natural = line.scrollWidth;
      const avail = line.clientWidth;
      if (natural > avail + 0.5) {
        line.style.fontSize = `${(fontPx * avail) / natural - 0.05}px`;
      }
    });
  }, [fontPx]);

  useLayoutEffect(() => {
    fitLines();
    let alive = true;
    const fonts = document.fonts;
    if (fonts?.load) {
      void fonts
        .load(`${Math.round(fontPx) || 20}px "KFGQPC Hafs"`)
        .then(() => alive && fitLines())
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [fitLines, fontPx, lines]);

  const ayahIndex = useMemo(() => {
    const map = new Map<string, AyahText>();
    for (const seg of segments) for (const a of seg.ayahs) map.set(`${seg.surahId}:${a.n}`, a);
    return map;
  }, [segments]);

  const tap = (surah: number, ayah: number) => {
    const a = ayahIndex.get(`${surah}:${ayah}`);
    if (a && onAyahTap) onAyahTap(surah, a);
  };

  return (
    <div ref={boxRef} className={zoom > 1 ? "overflow-x-auto overscroll-x-contain" : ""}>
      <div
        className={`${opening ? "flex flex-col justify-center py-[6%]" : ""} ${zoom > 1 ? "px-3" : ""}`}
        style={{
          fontFamily: MUSHAF15_FONT,
          fontSize: fontPx ? `${fontPx}px` : undefined,
          width: zoom > 1 && width ? `${width * zoom}px` : undefined,
          visibility: fontPx ? "visible" : "hidden",
        }}
        lang="ar"
      >
        {lines.map((line, i) => (
          <div key={i} style={{ height: `${ROW_EM}em` }} className="relative flex items-center">
            {marginMarks.get(i)?.start && (
              <span
                className="pointer-events-none absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap font-sans text-[0.5rem] leading-none text-gold [writing-mode:vertical-rl]"
                data-marker={marginMarks.get(i)?.start?.kind}
              >
                {markerLabel(marginMarks.get(i)!.start!)}
              </span>
            )}
            {marginMarks.get(i)?.sajdah && (
              <span
                className="pointer-events-none absolute right-full top-1/2 mr-1 -translate-y-1/2 whitespace-nowrap font-sans text-[0.5rem] leading-none text-gold [writing-mode:vertical-rl]"
                data-marker="sajdah"
              >
                {t("mushafReader.meta.sajdah")}
              </span>
            )}
            {line.t === "h" ? (
              <SurahBanner nameAr={bareSurahNameAr(SURAH_META[line.s - 1].nameAr)} />
            ) : line.t === "b" ? (
              <div className="w-full text-center leading-none text-foreground">{QPC_BASMALA}</div>
            ) : isAyahLine(line) ? (
              <div
                data-line
                className={`flex w-full whitespace-nowrap leading-none text-foreground ${
                  opening ? "justify-center gap-[0.28em]" : "justify-between gap-[0.2em]"
                }`}
              >
                {line.w.map(([ayah, text], j) => {
                  const key = `${line.s}:${ayah}`;
                  const selected = key === selectedKey;
                  const tag = markedTags?.get(key);
                  return (
                    <span
                      key={j}
                      data-ayah={key}
                      onClick={onAyahTap ? () => tap(line.s, ayah) : undefined}
                      className={`rounded-[0.2em] px-[0.02em] py-[0.3em] transition-colors ${
                        onAyahTap ? "cursor-pointer" : ""
                      } ${
                        selected
                          ? "bg-primary/15"
                          : tag
                            ? TAG_BG[tag]
                            : onAyahTap
                              ? "active:bg-primary/10"
                              : ""
                      } ${text ? "" : "text-gold"}`}
                      role={text ? undefined : "button"}
                      tabIndex={text || !onAyahTap ? undefined : 0}
                      aria-label={
                        text
                          ? undefined
                          : t("mushafReader.ayahOptions", {
                              surah: SURAH_META[line.s - 1].nameAr,
                              ayah: toArabicDigits(ayah),
                            })
                      }
                      onKeyDown={
                        text || !onAyahTap
                          ? undefined
                          : (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                tap(line.s, ayah);
                              }
                            }
                      }
                    >
                      {text ?? toArabicDigits(ayah)}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** هل بدأت الآية في سطر سابق من الصفحة (فلا تُعلَّم بداية لها في هذا السطر)؟ */
function prevLineHas(lines: Mushaf15Line[], i: number, ayah: number, surah: number): boolean {
  for (let k = i - 1; k >= 0; k--) {
    const l = lines[k];
    if (!isAyahLine(l)) continue;
    return l.s === surah && l.w.some(([a]) => a === ayah);
  }
  return false;
}

type MushafPageStateReady = Extract<MushafPageState, { status: "ready" }>["data"];

/* ---------------- Page pieces ---------------- */

/** Ornamental surah headband, as printed in the Madani Mushaf. */
function SurahBanner({ nameAr }: { nameAr: string }) {
  const t = useT();
  return (
    <div className="flex w-full justify-center">
      <div className="relative w-full overflow-hidden rounded-md border-2 border-primary/70 bg-primary/90 p-[3px] shadow-soft">
        <div className="relative flex items-center justify-center overflow-hidden rounded-[3px] border border-gold/50 bg-[color-mix(in_oklab,var(--color-primary)_10%,var(--color-card))] px-8 py-[0.22em]">
          <BannerFlourish className="absolute right-1 top-1/2 h-[1.1em] w-[3em] -translate-y-1/2 text-gold/70" />
          <BannerFlourish className="absolute left-1 top-1/2 h-[1.1em] w-[3em] -translate-y-1/2 scale-x-[-1] text-gold/70" />
          <span
            className="relative font-display font-medium leading-none text-foreground"
            style={{ fontSize: "0.72em" }}
          >
            {t("mushafReader.bannerSurah", { surah: nameAr })}
          </span>
        </div>
      </div>
    </div>
  );
}

function BannerFlourish({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 24" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12c6-7 12-7 18 0-6 7-12 7-18 0Z" />
        <path d="M39 12c5-5 10-5 15 0-5 5-10 5-15 0Z" />
        <path d="M56 6c4 3 4 9 0 12" />
      </g>
    </svg>
  );
}

/** Bottom page-number plate with a small arabesque, as printed. */
function PageNumberPlate({ page }: { page: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <BannerFlourish className="h-4 w-10 scale-x-[-1] text-gold/60" />
      <span className="rounded-md border border-primary/50 bg-primary/10 px-4 py-0.5 text-[0.75rem] font-medium tabular-nums text-foreground">
        {toArabicDigits(page)}
      </span>
      <BannerFlourish className="h-4 w-10 text-gold/60" />
    </div>
  );
}

/* ---------------- States ---------------- */

function PageLoading({ page }: { page: number }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[0.625rem] font-medium uppercase tracking-[0.3em] text-gold">
        {t("mushafReader.loading")}
      </span>
      <div className="font-display text-lg text-foreground/80">
        {t("mushafReader.meta.page", { n: toArabicDigits(page) })}
      </div>
      <div className="mt-2 grid w-full gap-3">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
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

function PageError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Icon d={icons.info} size={20} />
      </span>
      <div className="font-display text-base">{t("mushafReader.error.page")}</div>
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
