import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n";
import { SURAHS } from "@/lib/quran-meta";
import { SurahPicker } from "@/components/mushaf/reader/Pickers";
import {
  RANGE_DIRECTIONS,
  rangeDirection,
  rangePages,
  validateRange,
  type QuranRange,
  type RangeDirection,
} from "@/lib/daily-record";
import { MushafIcon } from "./MushafIcon";
import { AyahGrid } from "./AyahGrid";
import { RadioRow } from "./RadioRow";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

const INPUT =
  "w-full min-h-11 rounded-xl border border-border/60 bg-background/70 px-2 text-sm text-foreground outline-none focus:border-primary/60 disabled:opacity-60";
type AyahKey = "fromAyah" | "toAyah";
type SurahKey = "fromSurah" | "toSurah";
const SURAH_OF: Record<AyahKey, SurahKey> = { fromAyah: "fromSurah", toAyah: "toSurah" };
const maxOf = (n?: number) => (n ? (SURAHS[n - 1]?.ayahs ?? 0) : 0);

/**
 * مكوّن المدى الموحَّد للحفظ والمراجعة: من سورة/آية إلى سورة/آية.
 * - السورة من قائمة المصحف نفسها (SurahPicker): الرقم، والاسم، وعدد الآيات.
 * - الآية تُكتب يدوياً أو تُختار من شبكة أرقام آيات السورة المختارة (تظهر عند لمس الحقل).
 * - لا يُقبل رقم أكبر من عدد آيات السورة: يُقصر على آخر آية وتظهر رسالة فوراً.
 * - «اختيار من المصحف» يفتح على آخر آية سُجّلت. والتحقق نفسه على الخادم (save_daily_entry).
 * - الاتجاه (1.14.0): «الفاتحة إلى الناس» بترتيب المصحف، أو «الناس إلى الفاتحة» لمن يحفظ من الناس صعوداً؛
 *   فتُقيَّد سورة النهاية بما بعد البداية أو قبلها.
 */
export function QuranRangeField({
  label,
  value,
  onChange,
  onPickFromMushaf,
  disabled,
  showError,
  direction = "forward",
  onDirection,
  onRequestSurah,
}: {
  /**
   * اختيار السورة في نصف الشاشة نفسها (1.14.0): يُستدعى بحدود الاختيار، وdone تطبّق المختارة كما لو اختيرت
   * من القائمة المنبثقة. بلا هذا تُفتح SurahPicker كما كانت.
   */
  onRequestSurah?: (req: {
    key: "fromSurah" | "toSurah";
    current?: number;
    min: number;
    max: number;
    done: (n: number) => void;
  }) => void;
  label: string;
  value: Partial<QuranRange>;
  /** اتجاه المدى عبر السور. */
  direction?: RangeDirection;
  /** تغيير الاتجاه (يُخفى المفتاح إن لم يُمرَّر). */
  onDirection?: (d: RangeDirection) => void;
  onChange: (v: Partial<QuranRange>) => void;
  onPickFromMushaf: () => void;
  disabled: boolean;
  showError: boolean;
}) {
  const t = useT();
  const id = useId();
  // البداية معروفة (تكملة آخر تسجيل) والنهاية فارغة: شبكة «إلى آية» مفتوحة، فيكفي المعلّم لمسة واحدة.
  const [grid, setGrid] = useState<AyahKey | null>(() =>
    !disabled && value.fromSurah && value.fromAyah && value.toSurah && !value.toAyah
      ? "toAyah"
      : null,
  );
  const [picking, setPicking] = useState<SurahKey | null>(null);
  const [over, setOver] = useState<{ surah: number; max: number } | null>(null);
  const err = validateRange(value);
  const pages = err ? 0 : rangePages(value as QuranRange);
  const set = (p: Partial<QuranRange>) => onChange({ ...value, ...p });

  /** يقصر الآية على حدود سورتها، ويُظهر رسالة إن تجاوزها المُدخل. */
  const clampAyah = (key: AyahKey, n: number | undefined, surah = value[SURAH_OF[key]]) => {
    const max = maxOf(surah);
    if (n && max && n > max) {
      setOver({ surah: surah!, max });
      return max;
    }
    setOver(null);
    return n;
  };
  const typed = (key: AyahKey, v: string) => {
    const n = v === "" ? undefined : Math.max(1, Math.floor(Number(v)) || 1);
    set({ [key]: clampAyah(key, n) });
  };
  const pickSurah = (key: SurahKey, n: number) => {
    const next: Partial<QuranRange> = { ...value, [key]: n };
    // اختيار سورة البداية يقترح النهاية في السورة نفسها إن لم تُحدَّد أو خالفت الاتجاه.
    if (
      key === "fromSurah" &&
      (!value.toSurah || (direction === "forward" ? value.toSurah < n : value.toSurah > n))
    )
      next.toSurah = n;
    // آية أكبر من آيات السورة الجديدة تُقصر على آخر آية فيها، مع رسالة.
    let msg: { surah: number; max: number } | null = null;
    for (const k of ["fromAyah", "toAyah"] as const) {
      const sn = next[SURAH_OF[k]];
      const max = maxOf(sn);
      const ayah = next[k];
      if (sn && ayah && max && ayah > max) {
        next[k] = max;
        msg = { surah: sn, max };
      }
    }
    setOver(msg);
    onChange(next);
    setPicking(null);
    setGrid(key === "fromSurah" ? "fromAyah" : "toAyah");
  };
  const pickAyah = (key: AyahKey, n: number) => {
    setOver(null);
    if (key === "fromAyah") {
      const sameSurah = value.toSurah === value.fromSurah;
      // بداية بعد النهاية في السورة نفسها ⇒ تُمسح النهاية ليختارها المعلّم.
      const clearTo = sameSurah && value.toAyah != null && value.toAyah < n;
      set({ fromAyah: n, ...(clearTo ? { toAyah: undefined } : {}) });
      setGrid(value.toSurah ? "toAyah" : null);
    } else {
      set({ toAyah: n });
      setGrid(null);
    }
  };

  const surahButton = (key: SurahKey, text: string) => {
    const n = value[key];
    const s = n ? SURAHS[n - 1] : null;
    return (
      <div className="grid gap-1 text-xs text-muted-foreground">
        <span id={`${id}-${key}`}>{text}</span>
        <button
          type="button"
          disabled={disabled}
          aria-labelledby={`${id}-${key}`}
          aria-haspopup="dialog"
          onClick={() => {
            if (!onRequestSurah) return setPicking(key);
            const to = key === "toSurah";
            onRequestSurah({
              key,
              current: value[key],
              min: to && direction === "forward" ? (value.fromSurah ?? 1) : 1,
              max: to && direction === "backward" ? (value.fromSurah ?? 114) : 114,
              done: (n) => pickSurah(key, n),
            });
          }}
          className={`${INPUT} flex items-center gap-2 text-start`}
        >
          {s ? (
            <>
              <span className="w-7 h-7 shrink-0 rounded-lg border border-gold/30 bg-gold/10 text-gold-ink text-xs font-bold flex items-center justify-center tabular-nums">
                {s.n}
              </span>
              <span className="flex-1 min-w-0 truncate font-display text-sm font-medium">
                {s.name}
              </span>
              <span className="shrink-0 rounded-md bg-muted/70 px-1.5 text-xs tabular-nums text-muted-foreground">
                {t("surahPicker.ayahs", { n: s.ayahs })}
              </span>
            </>
          ) : (
            <span className="flex-1 text-muted-foreground">
              {t("dailyRecord.range.chooseSurah")}
            </span>
          )}
          <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>
    );
  };
  const ayahInput = (key: AyahKey, text: string) => {
    const max = maxOf(value[SURAH_OF[key]]);
    return (
      <label className="grid gap-1 text-xs text-muted-foreground">
        {text}
        <span className="relative">
          <input
            type="number"
            inputMode="numeric"
            dir="ltr"
            min={1}
            max={max || undefined}
            value={value[key] ?? ""}
            disabled={disabled}
            aria-invalid={!!over && grid === key}
            aria-controls={grid === key ? `${id}-grid` : undefined}
            aria-expanded={grid === key}
            onFocus={() => max && setGrid(key)}
            onChange={(e) => typed(key, e.target.value)}
            className={`${INPUT} text-center tabular-nums ${grid === key ? "border-primary/60 ring-2 ring-primary/20" : ""}`}
          />
        </span>
      </label>
    );
  };

  const gridSurah = grid ? value[SURAH_OF[grid]] : undefined;
  const gridMax = maxOf(gridSurah);
  const minInGrid =
    grid === "toAyah" && value.toSurah === value.fromSurah && value.fromAyah ? value.fromAyah : 1;
  const inRange = (n: number) =>
    value.fromSurah === value.toSurah &&
    value.fromSurah === gridSurah &&
    !!value.fromAyah &&
    !!value.toAyah &&
    n >= value.fromAyah &&
    n <= value.toAyah;
  const liveErr =
    err === "ayahOutOfSurah" || err === "endBeforeStart" || err === "tooLong" ? err : null;

  /** تغيير الاتجاه: مدى عبر سور يخالفه يُقصر على سورة البداية ليختار المعلّم النهاية من جديد. */
  const changeDirection = (d: RangeDirection) => {
    if (
      value.fromSurah &&
      value.toSurah &&
      value.fromSurah !== value.toSurah &&
      rangeDirection(value) !== d
    )
      onChange({ ...value, toSurah: value.fromSurah, toAyah: undefined });
    onDirection?.(d);
  };

  return (
    <fieldset className="space-y-2" aria-describedby={`${id}-hint`}>
      <legend className="sr-only">{label}</legend>
      {onDirection && (
        <RadioRow
          label={t("dailyRecord.range.direction.label", { kind: label })}
          value={direction}
          disabled={disabled}
          onSelect={changeDirection}
          className="grid grid-cols-2 gap-1 rounded-xl bg-muted/40 p-0.5"
          items={RANGE_DIRECTIONS.map((d) => ({
            value: d,
            label: t(`dailyRecord.range.direction.${d}`),
            content: t(`dailyRecord.range.direction.${d}`),
            className: (on: boolean) =>
              `min-h-11 rounded-lg px-1 text-xs font-bold disabled:opacity-60 ${
                on ? "bg-card text-primary shadow-soft" : "text-muted-foreground"
              }`,
          }))}
        />
      )}
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        {surahButton("fromSurah", t("dailyRecord.range.fromSurah"))}
        {ayahInput("fromAyah", t("dailyRecord.range.fromAyah"))}
        {surahButton("toSurah", t("dailyRecord.range.toSurah"))}
        {ayahInput("toAyah", t("dailyRecord.range.toAyah"))}
      </div>

      {grid && gridMax > 0 && !disabled && (
        <AyahGrid
          id={`${id}-grid`}
          title={t(`dailyRecord.range.grid.${grid}`, { surah: SURAHS[gridSurah! - 1]?.name ?? "" })}
          max={gridMax}
          min={minInGrid}
          value={value[grid]}
          inRange={inRange}
          onPick={(n) => pickAyah(grid, n)}
          onClose={() => setGrid(null)}
        />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPickFromMushaf}
          disabled={disabled}
          className="min-h-11 ps-2 pe-3 rounded-2xl border border-gold/40 bg-gradient-to-b from-gold/15 to-gold/5 text-primary text-xs font-bold flex items-center gap-2 shadow-soft transition active:scale-95 disabled:opacity-60"
        >
          <span className="w-8 h-8 rounded-xl bg-card/80 flex items-center justify-center">
            <MushafIcon className="w-6 h-6" />
          </span>
          {t("dailyRecord.range.pickMushaf")}
        </button>
        <p id={`${id}-hint`} className="flex-1 text-xs text-end" aria-live="polite">
          {over ? (
            <span className="text-destructive font-bold">
              {t("dailyRecord.range.errors.maxAyah", {
                surah: SURAHS[over.surah - 1]?.name ?? "",
                n: over.max,
              })}
            </span>
          ) : (showError && err) || liveErr ? (
            <span className="text-destructive">
              {t(`dailyRecord.range.errors.${(showError && err) || liveErr}`)}
            </span>
          ) : pages ? (
            <span className="text-muted-foreground">
              {t("dailyRecord.range.pages", { n: pages })}
            </span>
          ) : null}
        </p>
      </div>

      <SurahPicker
        open={!!picking}
        onOpenChange={(o) => !o && setPicking(null)}
        current={(picking && value[picking]) || 0}
        minSurah={picking === "toSurah" && direction === "forward" ? (value.fromSurah ?? 1) : 1}
        maxSurah={
          picking === "toSurah" && direction === "backward" ? (value.fromSurah ?? 114) : 114
        }
        onPick={(s) => picking && pickSurah(picking, s.id)}
      />
    </fieldset>
  );
}
