import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MushafPageRenderer } from "@/components/zen/quran/mushaf-page-renderer";
import { useMushafPage } from "@/hooks/quran/use-mushaf-page";
import { clampPage, MUSHAF_PAGE_COUNT, surahIdsOnPage } from "@/lib/quran/page-service";
import { SETTLE_MS } from "@/components/mushaf/reader/constants";
import { Icon } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { toArabicDigits } from "@/lib/quran";
import { useBookmarks, type BookmarkTag } from "@/lib/quran/bookmarks";
import { SURAH_META } from "@/lib/quran/metadata";
import { clampZoom, MUSHAF_ZOOM_STEPS, useReadingPrefs } from "@/lib/quran/reading-prefs";
import { recordRead } from "@/lib/quran/reading-history";
import {
  juzOf,
  MIN_PAGE_DWELL_MS,
  notePagesRead,
  PageDwellTracker,
  pageStart,
} from "@/lib/quran/reading-tracker";
import type { AyahText } from "@/lib/quran/text-types";
import { useT } from "@/lib/i18n";
import { GoToDialog } from "@/components/mushaf/reader/GoToDialog";
import { ensureMushafDict } from "@/lib/quran/mushaf-i18n";

// قاموس القارئ الكسول: يُضاف متزامناً قبل أول رسم.
void ensureMushafDict();

/** المسافة الأفقية الدنيا (px) ليُعدّ السحب تقليباً. */
const SWIPE_MIN = 46;

/**
 * وضع صفحات المصحف (1..604).
 * التقليب: سحب بإصبع واحد (لا يُحسب القرص بإصبعين)، أو أسهم لوحة المفاتيح (← التالية كالمصحف
 * العربي)، أو شريطَي الحافتين، أو المنزلق السريع. القرص بإصبعين يكبّر الصفحة.
 */
export function MushafPagesMode({
  page,
  onChange,
  onAyahTap,
  onGoAyah,
  selectedKey,
  immersive = false,
  audioState = "idle",
  onAudio,
  onToggleChrome,
}: {
  page: number;
  onChange: (page: number) => void;
  onAyahTap: (surah: number, ayah: AyahText) => void;
  /** الانتقال إلى آية بعينها من نافذة «الانتقال إلى» (تُميَّز في الصفحة). */
  onGoAyah?: (surah: number, ayah: number) => void;
  selectedKey?: string;
  immersive?: boolean;
  /** حالة التلاوة لزر التشغيل في شريط التنقل. */
  audioState?: string;
  onAudio?: () => void;
  /** نقرة على فراغ الصفحة (لا على آية): إظهار الواجهة أو إخفاؤها. */
  onToggleChrome?: () => void;
}) {
  const t = useT();
  const state = useMushafPage(page);
  const { items: bookmarks } = useBookmarks();
  const { prefs, update: updatePrefs } = useReadingPrefs();
  const zoom = clampZoom(prefs.mushafZoom);
  const markedTags = useMemo(
    () => new Map<string, BookmarkTag>(bookmarks.map((b) => [`${b.surah}:${b.ayah}`, b.tag])),
    [bookmarks],
  );
  const trackerRef = useRef(new PageDwellTracker());

  // الصفحة المقروءة: الانتقال إلى التالية بعد مكوث كافٍ، أو المكوث على الأخيرة.
  useEffect(() => {
    notePagesRead(trackerRef.current.visit(page, Date.now()));
    if (page !== MUSHAF_PAGE_COUNT) return;
    const id = window.setTimeout(
      () => notePagesRead(trackerRef.current.finish(Date.now())),
      MIN_PAGE_DWELL_MS,
    );
    return () => window.clearTimeout(id);
  }, [page]);

  // موضع القارئ في وضع المصحف يُسجَّل بعد استقرار قصير على الصفحة.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const start = pageStart(page);
      recordRead({ ...start, page, juz: juzOf(start.surah, start.ayah), mode: "mushaf" });
    }, SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [page]);

  const [jumpOpen, setJumpOpen] = useState(false);
  const [drag, setDrag] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const touchRef = useRef<{ x: number; y: number; multi: boolean } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const [pinchZoom, setPinchZoom] = useState<number | null>(null);
  const shownZoom = pinchZoom ?? zoom;

  const go = useCallback(
    (delta: number) => {
      const next = clampPage(page + delta);
      if (next !== page) onChange(next);
    },
    [page, onChange],
  );

  // لوحة المفاتيح: ← التالية و→ السابقة (اتجاه المصحف العربي)، وPageDown/PageUp.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft" || e.key === "PageDown") go(1);
      else if (e.key === "ArrowRight" || e.key === "PageUp") go(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const setZoom = (z: number) => updatePrefs({ mushafZoom: clampZoom(z) });
  const stepZoom = (dir: 1 | -1) => {
    const steps = MUSHAF_ZOOM_STEPS as readonly number[];
    const next =
      dir > 0
        ? steps.find((s) => s > zoom + 0.001)
        : [...steps].reverse().find((s) => s < zoom - 0.001);
    if (next) setZoom(next);
  };
  const dist = (a: React.Touch, b: React.Touch) =>
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const scrubPage = scrub ?? page;
  const scrubSurah = SURAH_META[(surahIdsOnPage(scrubPage)[0] ?? 1) - 1]?.nameAr ?? "";

  return (
    <section
      className={immersive ? "px-1 pt-3 pb-16" : "mt-3 px-2"}
      aria-label={t("mushafReader.area.mushaf")}
    >
      {/* سطح الصفحة المطبوعة: ١٥ سطراً بعرض الشاشة */}
      <div
        className="relative select-none overflow-hidden rounded-[26px] border border-border/60 bg-card/85 shadow-elegant backdrop-blur-2xl"
        style={{ touchAction: zoom > 1 ? "pan-x pan-y" : "pan-y" }}
        onClick={(e) => {
          // فراغ الصفحة لا الآيات ولا الأزرار: إظهار الواجهة أو إخفاؤها.
          if ((e.target as HTMLElement).closest("[data-ayah], button, a")) return;
          onToggleChrome?.();
        }}
        onTouchStart={(e) => {
          if (e.touches.length >= 2) {
            // إصبعان: قرص للتكبير، لا تقليب (كان القرص يقلب الصفحة أحياناً).
            touchRef.current = touchRef.current ? { ...touchRef.current, multi: true } : null;
            pinchRef.current = { dist: dist(e.touches[0], e.touches[1]), zoom };
            setDrag(0);
            return;
          }
          const p = e.touches[0];
          touchRef.current = { x: p.clientX, y: p.clientY, multi: false };
          setDrag(0);
        }}
        onTouchMove={(e) => {
          const pinch = pinchRef.current;
          if (pinch && e.touches.length >= 2) {
            const ratio = dist(e.touches[0], e.touches[1]) / Math.max(1, pinch.dist);
            setPinchZoom(clampZoom(pinch.zoom * ratio));
            return;
          }
          const start = touchRef.current;
          if (!start || start.multi || zoom > 1) return;
          const p = e.touches[0];
          const dx = p.clientX - start.x;
          const dy = p.clientY - start.y;
          if (Math.abs(dx) > Math.abs(dy)) setDrag(Math.max(-80, Math.min(80, dx)));
        }}
        onTouchEnd={(e) => {
          if (pinchRef.current) {
            if (e.touches.length === 0) {
              if (pinchZoom !== null) setZoom(pinchZoom);
              setPinchZoom(null);
              pinchRef.current = null;
              touchRef.current = null;
            }
            return;
          }
          const start = touchRef.current;
          touchRef.current = null;
          setDrag(0);
          // المكبَّرة تتمرّر أفقياً: التقليب بالأزرار والحافتين فقط.
          if (!start || start.multi || zoom > 1) return;
          const p = e.changedTouches[0];
          const dx = p.clientX - start.x;
          const dy = p.clientY - start.y;
          if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.2) return;
          // كالمصحف الورقي: السحب نحو اليمين يقلب إلى الصفحة التالية.
          go(dx > 0 ? 1 : -1);
        }}
      >
        <div className="pointer-events-none absolute inset-2.5 rounded-[20px] border border-gold/25" />

        {/* شريطا الحافتين: يسار = التالية، يمين = السابقة (في هامش الصفحة لا فوق النص). */}
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={page <= 1}
          className="absolute inset-y-10 right-0 z-10 w-3.5 opacity-0 focus-visible:opacity-100 focus-visible:bg-primary/15"
          aria-label={t("mushafReader.pages.prev")}
          aria-hidden="true"
          tabIndex={-1}
        />
        <button
          type="button"
          onClick={() => go(1)}
          disabled={page >= MUSHAF_PAGE_COUNT}
          className="absolute inset-y-10 left-0 z-10 w-3.5 opacity-0 focus-visible:opacity-100 focus-visible:bg-primary/15"
          aria-label={t("mushafReader.pages.next")}
          aria-hidden="true"
          tabIndex={-1}
        />

        <div
          className="relative px-4 pt-4 pb-3"
          dir="rtl"
          style={{
            transform: `translateX(${drag}px)`,
            transition: drag === 0 ? "transform 200ms ease-out" : "none",
          }}
        >
          <MushafPageRenderer
            page={page}
            state={state}
            onRetry={state.retry}
            onAyahTap={onAyahTap}
            selectedKey={selectedKey}
            markedTags={markedTags}
            zoom={shownZoom}
          />
        </div>
      </div>

      {!immersive && (
        <>
          {/* Page navigation — previous is on the right, next on the left */}
          <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2">
            <button
              onClick={() => go(-1)}
              disabled={page <= 1}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/70 text-foreground shadow-soft transition disabled:opacity-60 active:scale-95"
              aria-label={t("mushafReader.pages.prev")}
            >
              <Icon d={icons.chevron} size={18} />
            </button>
            <button
              onClick={() => setJumpOpen(true)}
              className="rounded-full border border-border/60 bg-card/70 py-2.5 text-[0.75rem] font-medium tabular-nums shadow-soft transition active:scale-[0.98]"
              aria-label={t("mushafReader.goto.open", {
                page: toArabicDigits(page),
                total: toArabicDigits(MUSHAF_PAGE_COUNT),
              })}
            >
              {t("mushafReader.pages.of", {
                page: toArabicDigits(page),
                total: toArabicDigits(MUSHAF_PAGE_COUNT),
              })}
            </button>
            <button
              onClick={onAudio}
              className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-soft transition active:scale-95 ${
                audioState === "idle"
                  ? "border-border bg-card/70 text-foreground"
                  : "border-primary/40 bg-primary/15 text-primary"
              }`}
              aria-label={
                audioState === "playing"
                  ? t("mushafReader.audio.pause")
                  : audioState === "idle"
                    ? t("mushafReader.audio.page")
                    : t("mushafReader.audio.resume")
              }
            >
              <Icon d={audioState === "playing" ? icons.pause : icons.play} size={17} />
            </button>
            <button
              onClick={() => go(1)}
              disabled={page >= MUSHAF_PAGE_COUNT}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/70 text-foreground shadow-soft transition disabled:opacity-60 active:scale-95"
              aria-label={t("mushafReader.pages.next")}
            >
              <span className="rotate-180">
                <Icon d={icons.chevron} size={18} />
              </span>
            </button>
          </div>

          {/* منزلق التقليب السريع + التكبير */}
          <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-1">
            <button
              type="button"
              onClick={() => stepZoom(-1)}
              disabled={zoom <= 1}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card/70 transition active:scale-95 disabled:opacity-40"
              aria-label={t("mushafReader.pages.zoomOut")}
            >
              <Icon d={icons.zoomOut} size={15} />
            </button>
            <div className="grid gap-0.5">
              <input
                type="range"
                min={1}
                max={MUSHAF_PAGE_COUNT}
                step={1}
                dir="rtl"
                value={scrubPage}
                onChange={(e) => setScrub(Number(e.target.value))}
                onPointerUp={() => {
                  if (scrub !== null && scrub !== page) onChange(scrub);
                  setScrub(null);
                }}
                onKeyUp={() => {
                  if (scrub !== null && scrub !== page) onChange(scrub);
                  setScrub(null);
                }}
                onBlur={() => setScrub(null)}
                aria-label={t("mushafReader.goto.slider")}
                aria-valuetext={t("mushafReader.goto.sliderValue", {
                  page: toArabicDigits(scrubPage),
                  surah: scrubSurah,
                })}
                className="w-full accent-[var(--color-primary)]"
              />
              <div
                className={`text-center text-[0.625rem] tabular-nums text-muted-foreground transition-opacity ${
                  scrub === null ? "opacity-0" : "opacity-100"
                }`}
                aria-hidden="true"
              >
                {t("mushafReader.goto.sliderValue", {
                  page: toArabicDigits(scrubPage),
                  surah: scrubSurah,
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => stepZoom(1)}
              disabled={zoom >= 2}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card/70 transition active:scale-95 disabled:opacity-40"
              aria-label={t("mushafReader.pages.zoomIn")}
            >
              <Icon d={icons.zoomIn} size={15} />
            </button>
          </div>
        </>
      )}

      <GoToDialog
        open={jumpOpen}
        onOpenChange={setJumpOpen}
        page={page}
        onGo={(target) => {
          setJumpOpen(false);
          if (target.surah && target.ayah && onGoAyah) onGoAyah(target.surah, target.ayah);
          onChange(clampPage(target.page));
        }}
      />
    </section>
  );
}
