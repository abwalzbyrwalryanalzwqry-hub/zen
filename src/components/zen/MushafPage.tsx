import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { SURAHS } from "@/lib/quran-meta";
import type { MushafPageState as State } from "@/hooks/useMushafPage";
import {
  MUSHAF15_FONT,
  QPC_BASMALA,
  isAyahLine,
  isOpeningPage,
  type Mushaf15Line,
} from "@/lib/mushaf15";

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const arDigits = (n: number) => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);

/**
 * عرض الصفحة بوحدة em. أسطر V1 بخط الحفص تتراوح بين ١٢٫٦ و٢٢٫٧em (الوسيط ١٦٫٣)؛
 * ١٨٫٤ يُدخل نحو ٩٠٪ منها كاملة، والباقي يضيق فراغه ثم يصغر خطه قليلاً.
 */
const LINE_EM = 18.4;
const ROW_EM = 1.95;
const INK = "text-[#1f1a10]";

/**
 * صفحة من مصحف المدينة (١٥ سطراً) كما في المطبوع، بخط مجمع الملك فهد (حفص).
 * حجم الخط يُشتق من عرض الصفحة حتى تبقى الأسطر مطابقة للمطبوع.
 * الخلفية فاتحة دائماً (ورق المصحف)، فالحبر داكن ثابت في الوضعين الفاتح والداكن.
 */
/**
 * اختيار آيات من الصفحة (السجل اليومي: «اختيار من المصحف»). اللمس على كلمة أو رقم آية يعيد
 * (السورة، الآية)، وما بين البداية والنهاية يُظلَّل. بلا هذا الوسيط تبقى الصفحة للقراءة كما كانت.
 */
export interface AyahSelect {
  onTap: (surah: number, ayah: number) => void;
  isSelected: (surah: number, ayah: number) => boolean;
  /** آية تومض وميضاً خفيفاً (آخر ما سُجّل للطالب) — اختياري. */
  isFlashing?: (surah: number, ayah: number) => boolean;
}

export function MushafPage({
  page,
  state,
  onRetry,
  select,
}: {
  page: number;
  state: State;
  onRetry: () => void;
  select?: AyahSelect;
}) {
  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center py-40">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-xs text-[#3a2f1a]">
          تعذّر تحميل الصفحة {page}. {state.error}
        </p>
        <button
          onClick={onRetry}
          className="rounded-2xl bg-primary text-primary-foreground px-4 py-2 text-xs font-bold"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }
  return <PageLines key={page} page={page} lines={state.data.l} select={select} />;
}

function PageLines({
  page,
  lines,
  select,
}: {
  page: number;
  lines: Mushaf15Line[];
  select?: AyahSelect;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const opening = isOpeningPage(page);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fontPx = width ? Math.max(12, Math.min(40, width / LINE_EM)) : 0;

  // تصغير أي سطر أطول من العرض — بعد تحميل الخط، وعند تغيّر العرض.
  const fitLines = useCallback(() => {
    const box = boxRef.current;
    if (!box || !fontPx) return;
    box.querySelectorAll<HTMLElement>("[data-line]").forEach((line) => {
      line.style.fontSize = "";
      line.style.columnGap = "";
      if (line.scrollWidth <= line.clientWidth + 0.5) return;
      line.style.columnGap = "0.08em";
      const natural = line.scrollWidth;
      const avail = line.clientWidth;
      if (natural > avail + 0.5) line.style.fontSize = `${(fontPx * avail) / natural - 0.05}px`;
    });
  }, [fontPx]);

  useLayoutEffect(() => {
    fitLines();
    let alive = true;
    void document.fonts
      ?.load(`${Math.round(fontPx) || 20}px "KFGQPC Hafs"`)
      .then(() => alive && fitLines())
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [fitLines, fontPx, lines]);

  return (
    <div
      ref={boxRef}
      dir="rtl"
      lang="ar"
      aria-label={`صفحة ${page} من المصحف الشريف`}
      className={`${INK} ${opening ? "flex flex-col justify-center py-[6%]" : ""}`}
      onClick={
        select
          ? (e) => {
              const el = (e.target as HTMLElement).closest<HTMLElement>("[data-a]");
              if (el) select.onTap(Number(el.dataset.s), Number(el.dataset.a));
            }
          : undefined
      }
      style={{
        fontFamily: MUSHAF15_FONT,
        fontSize: fontPx ? `${fontPx}px` : undefined,
        visibility: fontPx ? "visible" : "hidden",
      }}
    >
      {lines.map((line, i) => (
        <div key={i} style={{ height: `${ROW_EM}em` }} className="flex items-center">
          {line.t === "h" ? (
            <SurahBanner name={SURAHS[line.s - 1]?.name ?? ""} />
          ) : line.t === "b" ? (
            <div className="w-full text-center leading-none">{QPC_BASMALA}</div>
          ) : isAyahLine(line) ? (
            <div
              data-line
              className={`flex w-full whitespace-nowrap leading-none ${
                opening ? "justify-center gap-[0.28em]" : "justify-between gap-[0.2em]"
              }`}
            >
              {line.w.map(([ayah, text], j) => {
                const sel = !!select?.isSelected(line.s, ayah);
                const on = sel
                  ? "bg-primary/25 rounded-sm"
                  : select?.isFlashing?.(line.s, ayah)
                    ? "ayah-flash"
                    : "";
                if (select && text)
                  return (
                    <span key={j} data-s={line.s} data-a={ayah} className={`cursor-pointer ${on}`}>
                      {text}
                    </span>
                  );
                if (select)
                  return (
                    <button
                      key={j}
                      type="button"
                      data-s={line.s}
                      data-a={ayah}
                      aria-pressed={sel}
                      aria-label={`${SURAHS[line.s - 1]?.name ?? ""} ${ayah}`}
                      className={`text-[#7f5c12] leading-none rounded-sm focus-visible:outline-2 focus-visible:outline-primary ${on}`}
                    >
                      {arDigits(ayah)}
                    </button>
                  );
                return text ? (
                  <span key={j}>{text}</span>
                ) : (
                  <span key={j} className="text-[#7f5c12]" aria-label={`الآية ${ayah}`}>
                    {arDigits(ayah)}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** ترويسة السورة المزخرفة كما في مصحف المدينة. */
function SurahBanner({ name }: { name: string }) {
  return (
    <div className="flex w-full justify-center">
      <div className="relative w-full overflow-hidden rounded-md border-2 border-primary/70 bg-primary/90 p-[3px]">
        <div className="relative flex items-center justify-center overflow-hidden rounded-[3px] border border-[#c9a449]/60 bg-[#f4ecd6] px-8 py-[0.22em]">
          <Flourish className="absolute right-1 top-1/2 h-[1.1em] w-[3em] -translate-y-1/2 text-[#b08a2e]" />
          <Flourish className="absolute left-1 top-1/2 h-[1.1em] w-[3em] -translate-y-1/2 scale-x-[-1] text-[#b08a2e]" />
          <span
            className="relative font-display font-medium leading-none"
            style={{ fontSize: "0.72em" }}
          >
            سُورَةُ {name}
          </span>
        </div>
      </div>
    </div>
  );
}

function Flourish({ className }: { className?: string }) {
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

/** لوحة رقم الصفحة أسفلها. */
export function PageNumberPlate({ page }: { page: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <Flourish className="h-4 w-10 scale-x-[-1] text-[#b08a2e]" />
      <span className="rounded-md border border-primary/50 bg-primary/10 px-4 py-0.5 text-xs font-medium tabular-nums text-[#1f1a10]">
        {arDigits(page)}
      </span>
      <Flourish className="h-4 w-10 text-[#b08a2e]" />
    </div>
  );
}
