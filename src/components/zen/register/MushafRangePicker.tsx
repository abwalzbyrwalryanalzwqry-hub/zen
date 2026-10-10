import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, LocateFixed, RotateCcw } from "lucide-react";
import { MushafPage, PageNumberPlate } from "@/components/zen/MushafPage";
import { useMushafPage } from "@/hooks/useMushafPage";
import { useT } from "@/lib/i18n";
import { SURAHS } from "@/lib/quran-meta";
import { MUSHAF_TOTAL_PAGES } from "@/lib/mushaf15";
import { PAGE_STARTS } from "@/lib/quran/structure-data";
import {
  inRangePos,
  nextPos,
  orderPick,
  pageOf,
  type QuranRange,
  type RangeDirection,
} from "@/lib/daily-record";
import { rangeText } from "@/lib/daily-record-text";
import { SurahList } from "./SurahList";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

export type Pos = [surah: number, ayah: number];
/** a قبل b في اتجاه الحفظ (backward: السورة الأكبر رقماً أولاً، والآيات تصاعدياً داخل السورة). */
const before = (a: Pos, b: Pos, dir: RangeDirection = "forward") =>
  a[0] === b[0] ? a[1] < b[1] : dir === "backward" ? a[0] > b[0] : a[0] < b[0];
const DOUBLE_TAP_MS = 380;

/**
 * «اختيار من المصحف»: صفحات المصحف نفسها (MushafPage) في سياق اختيار مدى.
 * - 1.35.0: البداية محدَّدة سلفاً كالنموذج تماماً: من النموذج إن وُجدت، وإلا الآية التي تلي آخر ما سُجّل.
 *   يُفتح على صفحتها، فيلمس المعلّم آية النهاية فقط (ولمسة أخرى تغيّر النهاية، و«إعادة» تحرّر البداية).
 * - تومض آخر آية سُجّلت للطالب (focus) وميضاً خفيفاً لتنبيه المعلّم.
 * - نقرتان سريعتان على آية تجعلانها «إلى» وتعتمدان المدى فوراً: البداية من النموذج إن وُجدت، وإلا
 *   الآية التي تلي آخر ما سُجّل.
 * - ويبقى الاختيار بلمستين منفصلتين (بداية ثم نهاية) ثم «اعتماد المدى».
 * - 1.14.0: محتوى داخل نصف شاشة الطالب نفسها (لا نافذة فوق نافذة)؛ والانتقال إلى سورة قائمة في المكان نفسه.
 */
export default function MushafRangePicker({
  initial,
  direction = "forward",
  focus,
  onPick,
}: {
  initial: Partial<QuranRange>;
  /** اتجاه المدى عبر السور (1.14.0). */
  direction?: RangeDirection;
  /** آخر آية سُجّلت للطالب في هذا النوع (حفظ أو مراجعة). */
  focus?: Pos | null;
  onPick: (r: QuranRange) => void;
}) {
  const t = useT();
  const preset: Pos | null =
    initial.fromSurah && initial.fromAyah
      ? [initial.fromSurah, initial.fromAyah]
      : focus
        ? nextPos(focus, direction)
        : null;
  const startPage = preset ? pageOf(preset[0], preset[1]) : 1;
  const [page, setPage] = useState(startPage);
  const [reload, setReload] = useState(0);
  const [anchor, setAnchor] = useState<Pos | null>(preset);
  const [range, setRange] = useState<QuranRange | null>(null);
  const [surahOpen, setSurahOpen] = useState(false);
  const [seek, setSeek] = useState(0);
  const state = useMushafPage(page, reload);
  const box = useRef<HTMLDivElement>(null);
  const lastTap = useRef<{ s: number; a: number; at: number } | null>(null);
  const focusPage = focus ? pageOf(focus[0], focus[1]) : 0;

  // التمرير إلى الآية الوامضة بعد رسم صفحتها (عند الفتح، وعند «اذهب إليها»).
  const fs = focus?.[0] ?? 0;
  const fa = focus?.[1] ?? 0;
  useEffect(() => {
    if (!fs || page !== focusPage || state.status !== "ready") return;
    const id = window.setTimeout(() => {
      box.current
        ?.querySelector(`[data-s="${fs}"][data-a="${fa}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [fs, fa, focusPage, page, state.status, seek]);

  const go = (p: number) => setPage(Math.min(MUSHAF_TOTAL_PAGES, Math.max(1, p)));
  const startFor = (end: Pos): Pos => {
    const fromForm: Pos | null =
      initial.fromSurah && initial.fromAyah ? [initial.fromSurah, initial.fromAyah] : null;
    if (fromForm && !before(end, fromForm, direction)) return fromForm;
    const next = focus ? nextPos(focus, direction) : null;
    if (next && !before(end, next, direction)) return next;
    return end;
  };
  const tap = (s: number, a: number) => {
    const now = performance.now();
    const prev = lastTap.current;
    lastTap.current = { s, a, at: now };
    // نقرتان سريعتان على الآية نفسها: «إلى» هذه الآية، والاعتماد فوراً.
    if (prev && prev.s === s && prev.a === a && now - prev.at < DOUBLE_TAP_MS) {
      lastTap.current = null;
      onPick(orderPick(startFor([s, a]), [s, a], direction));
      return;
    }
    // البداية ثابتة، وكل لمسة بعدها تحدّد النهاية (أو تغيّرها).
    if (!anchor) setAnchor([s, a]);
    else setRange(orderPick(anchor, [s, a], direction));
  };
  const isSelected = (s: number, a: number) => {
    if (range) return inRangePos(range, s, a);
    return !!anchor && anchor[0] === s && anchor[1] === a;
  };
  const isFlashing = (s: number, a: number) => !!focus && focus[0] === s && focus[1] === a;
  const step = range ? "done" : anchor ? "end" : "start";
  const surahOfPage = PAGE_STARTS[page - 1]?.[0] ?? 1;
  const nav =
    "min-h-11 min-w-11 rounded-xl glass flex items-center justify-center disabled:opacity-40";

  if (surahOpen)
    return (
      <SurahList
        current={surahOfPage}
        onPick={(n) => {
          go(pageOf(n, 1));
          setSurahOpen(false);
        }}
      />
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold text-foreground" aria-live="polite">
        {step === "done" && range
          ? rangeText(range)
          : step === "end" && anchor
            ? t("dailyRecord.mushaf.endFrom", {
                surah: SURAHS[anchor[0] - 1]?.name ?? "",
                ayah: anchor[1],
              })
            : t(step === "start" ? "dailyRecord.mushaf.start" : "dailyRecord.mushaf.end")}
      </p>
      {focus ? (
        <div className="flex items-center gap-2 rounded-2xl bg-gold/10 border border-gold/30 px-3 py-1.5">
          <span className="flex-1 text-xs text-foreground">
            {t("dailyRecord.mushaf.lastAyah", {
              surah: SURAHS[focus[0] - 1]?.name ?? "",
              ayah: focus[1],
            })}
            <span className="block text-muted-foreground">{t("dailyRecord.mushaf.doubleTap")}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              go(focusPage);
              setSeek((n) => n + 1);
            }}
            className="min-h-11 px-2.5 rounded-xl glass text-xs font-bold text-primary flex items-center gap-1"
          >
            <LocateFixed className="w-4 h-4" aria-hidden="true" />
            {t("dailyRecord.mushaf.goLast")}
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground px-1">{t("dailyRecord.mushaf.doubleTap")}</p>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          aria-label={t("dailyRecord.mushaf.prev")}
          className={nav}
        >
          <ChevronRight className="w-4 h-4 ltr:rotate-180" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t("dailyRecord.mushaf.surah")}
          aria-haspopup="dialog"
          onClick={() => setSurahOpen(true)}
          className="flex-1 min-w-0 min-h-11 rounded-xl border border-border/60 bg-background/70 px-2 text-sm flex items-center gap-2"
        >
          <span className="w-7 h-7 shrink-0 rounded-lg border border-gold/30 bg-gold/10 text-gold-ink text-xs font-bold flex items-center justify-center tabular-nums">
            {surahOfPage}
          </span>
          <span className="flex-1 truncate text-start font-display font-medium">
            {SURAHS[surahOfPage - 1]?.name}
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          dir="ltr"
          min={1}
          max={MUSHAF_TOTAL_PAGES}
          value={page}
          aria-label={t("dailyRecord.mushaf.page")}
          onChange={(e) => e.target.value && go(Number(e.target.value))}
          className="w-16 min-h-11 rounded-xl border border-border/60 bg-background/70 text-center text-sm tabular-nums"
        />
        <button
          type="button"
          onClick={() => go(page + 1)}
          disabled={page >= MUSHAF_TOTAL_PAGES}
          aria-label={t("dailyRecord.mushaf.next")}
          className={nav}
        >
          <ChevronLeft className="w-4 h-4 ltr:rotate-180" aria-hidden="true" />
        </button>
      </div>
      <div
        ref={box}
        className="overflow-y-auto rounded-3xl bg-mushaf-paper border border-gold/30 px-3 pt-3 pb-2 select-none"
      >
        <MushafPage
          page={page}
          state={state}
          onRetry={() => setReload((n) => n + 1)}
          select={{ onTap: tap, isSelected, isFlashing }}
        />
        <PageNumberPlate page={page} />
      </div>
      <div className="sticky -bottom-4 -mx-4 -mb-4 grid grid-cols-[auto_1fr] gap-2 border-t border-border/60 bg-background/95 px-4 pt-2 pb-3">
        <button
          type="button"
          onClick={() => {
            setAnchor(null);
            setRange(null);
          }}
          disabled={!anchor}
          className="min-h-11 px-3 rounded-xl glass text-xs font-bold flex items-center gap-1 disabled:opacity-40"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          {t("dailyRecord.mushaf.reset")}
        </button>
        <button
          type="button"
          disabled={!range}
          onClick={() => range && onPick(range)}
          className="min-h-11 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
        >
          {t("dailyRecord.mushaf.confirm")}
        </button>
      </div>
    </div>
  );
}
