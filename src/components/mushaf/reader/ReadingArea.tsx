import { SETTLE_MS } from "@/components/mushaf/reader/constants";
import { useCallback, useEffect, useRef } from "react";
import { SurahRenderer } from "@/components/zen/quran/surah-renderer";
import { useSurahText } from "@/hooks/quran/use-surah-text";
import { recordRead } from "@/lib/quran/reading-history";
import { notePagesRead, PageDwellTracker, surahEndsPage } from "@/lib/quran/reading-tracker";
import type { AyahText } from "@/lib/quran/text-types";
import { useT } from "@/lib/i18n";
import { ensureMushafDict } from "@/lib/quran/mushaf-i18n";

// قاموس القارئ الكسول: يُضاف متزامناً قبل أول رسم.
void ensureMushafDict();

/**
 * أول عقدة (بترتيبها في الصفحة) يتجاوز أسفلُها الحدَّ `top`: بحث ثنائي بدل المرور على كل
 * الآيات مع كل إطار تمرير (٢٨٦ قياساً في البقرة صارت نحو ٩).
 */
function firstBelow(nodes: ArrayLike<HTMLElement>, top: number): HTMLElement | null {
  let lo = 0;
  let hi = nodes.length - 1;
  let found: HTMLElement | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (nodes[mid].getBoundingClientRect().bottom > top) {
      found = nodes[mid];
      hi = mid - 1;
    } else lo = mid + 1;
  }
  return found;
}

/** منطقة قراءة السورة (النص العثماني من الخدمة). */
/** نتجاهل التمرير الآلي إلى الآية المستهدفة عند الفتح. */
const AUTO_SCROLL_MS = 1500;

export function MushafReadingArea({
  surahId,
  surahNameAr,
  activeAyah,
  playingAyah,
  onAyahTap,
  onPosition,
  onSettled,
  immersive = false,
}: {
  surahId: number;
  surahNameAr: string;
  activeAyah?: number | null;
  playingAyah?: number | null;
  immersive?: boolean;
  onAyahTap?: (ayah: AyahText) => void;
  /** الآية الظاهرة أعلى منطقة القراءة، مع كل تمرير. */
  onPosition?: (ayah: AyahText) => void;
  /** الموضع بعد استقرار التمرير (يُحفظ). */
  onSettled?: (ayah: AyahText) => void;
}) {
  const t = useT();
  const state = useSurahText(surahId);
  const scrollRef = useRef<HTMLElement>(null);
  const trackerRef = useRef(new PageDwellTracker());
  const ignoreUntilRef = useRef(0);

  const ayahs = state.status === "ready" ? state.data.ayahs : null;

  const save = useCallback(
    (a: AyahText) => {
      recordRead({ surah: surahId, ayah: a.n, page: a.p, juz: a.j, mode: "surah" });
      onSettled?.(a);
    },
    [surahId, onSettled],
  );

  // Record the reading session once the text is on screen.
  useEffect(() => {
    if (!ayahs) return;
    const target = ayahs.find((a) => a.n === (activeAyah ?? 1)) ?? ayahs[0];
    if (!target) return;
    ignoreUntilRef.current = Date.now() + AUTO_SCROLL_MS;
    trackerRef.current.reset();
    trackerRef.current.visit(target.p, Date.now());
    onPosition?.(target);
    save(target);
  }, [activeAyah, ayahs, surahId, onPosition, save]);

  // تتبع موضع القراءة الفعلي مع التمرير.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !ayahs) return;
    let frame = 0;
    let settle = 0;
    let last: AyahText | null = null;
    const byN = new Map(ayahs.map((a) => [a.n, a]));
    // العقد وارتفاع الترويسة يُقرآن مرة ويُحدَّثان عند تغيّر المقاس، لا مع كل إطار.
    let nodes = el.querySelectorAll<HTMLElement>("[data-ayah]");
    let headerBottom = 0;
    const remeasure = () => {
      nodes = el.querySelectorAll<HTMLElement>("[data-ayah]");
      const header = document.querySelector("[data-reader-header]");
      headerBottom = Math.max(0, header?.getBoundingClientRect().bottom ?? 0);
    };
    remeasure();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(remeasure);
    resize?.observe(el);

    // الحد الأعلى أسفل الترويسة الثابتة داخل منطقة التمرير.
    const topAyah = (): AyahText | null => {
      if (!nodes.length || !nodes[0].isConnected) remeasure();
      const node = firstBelow(nodes, headerBottom + 24);
      return node ? (byN.get(Number(node.dataset.ayah)) ?? null) : null;
    };

    const measure = () => {
      frame = 0;
      if (Date.now() < ignoreUntilRef.current) return;
      const a = topAyah();
      if (!a) return;
      const now = Date.now();
      const tracker = trackerRef.current;
      notePagesRead(tracker.visit(a.p, now));
      // نهاية السورة: الصفحة الأخيرة تُعدّ مقروءة إن لم تتبعها سورة أخرى على الصفحة نفسها.
      const viewBottom =
        el.closest<HTMLElement>("[data-quran-scroll]")?.getBoundingClientRect().bottom ??
        window.innerHeight;
      const atEnd = el.getBoundingClientRect().bottom <= viewBottom + 8;
      if (atEnd) {
        // لا تُحسب الصفحة الأخيرة إن بدأت السورة التالية فيها (جزء عمّ والنساء والإسراء…).
        if (surahEndsPage(surahId)) notePagesRead(tracker.finish(now));
      }
      if (a !== last) {
        last = a;
        onPosition?.(a);
      }
      window.clearTimeout(settle);
      settle = window.setTimeout(() => last && save(last), SETTLE_MS);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    // في زِن تتمرّر منطقة القراءة داخل إطار الشاشة، لا النافذة.
    const scroller: HTMLElement | Window = el.closest<HTMLElement>("[data-quran-scroll]") ?? window;
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      resize?.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [ayahs, surahId, onPosition, save]);
  return (
    <section
      className={immersive ? "px-1 pt-3 pb-16" : "mt-4 px-3 animate-fade-up"}
      aria-label={t("mushafReader.area.surah")}
      data-reading-area
      ref={scrollRef}
    >
      <div className="relative overflow-hidden rounded-[32px] border border-border/60 bg-card/60 shadow-elegant backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-3 rounded-[26px] border border-gold/25" />
        <div className="pointer-events-none absolute inset-5 rounded-[22px] border border-gold/10" />
        {["top-4 right-4", "top-4 left-4", "bottom-4 right-4", "bottom-4 left-4"].map((pos) => (
          <span
            key={pos}
            className={`pointer-events-none absolute ${pos} h-4 w-4 rotate-45 border border-gold/40`}
          />
        ))}

        <div className="relative min-h-[380px] px-6 py-8" dir="rtl">
          <SurahRenderer
            surahId={surahId}
            surahNameAr={surahNameAr}
            state={state}
            onRetry={state.retry}
            activeAyah={activeAyah}
            playingAyah={playingAyah}
            onAyahTap={onAyahTap}
          />
        </div>
      </div>
    </section>
  );
}
