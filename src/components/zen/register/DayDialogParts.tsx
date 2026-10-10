import { useId, useState } from "react";
import { ChevronDown, Minus, Plus, Star } from "lucide-react";
import { useT } from "@/lib/i18n";
import { gradeKeyOf5, gradeLabel } from "@/lib/grading";
import {
  EVAL_CRITERIA,
  nextPos,
  rangeOfLast,
  suggestAmount,
  validateRange,
  toPageEnd,
  wholeSurah,
  type DayKind,
  type DayStudent,
  type ErrorType,
  type Evaluation,
  type QuranRange,
  type RangeDirection,
} from "@/lib/daily-record";
import { RadioRow } from "./RadioRow";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

/** خمس درجات بميزان التقدير نفسه (ضعيف … ممتاز)، بنمط الاختيار الواحد ولوحة المفاتيح (DR-14). */
export function GradePicker({
  label,
  value,
  onChange,
  disabled,
  compact = false,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (g: number | null) => void;
  disabled: boolean;
  compact?: boolean;
}) {
  return (
    <RadioRow
      label={label}
      value={value}
      disabled={disabled}
      onSelect={onChange}
      onRepeat={() => onChange(null)}
      className="grid grid-cols-5 gap-1"
      items={[1, 2, 3, 4, 5].map((g) => ({
        value: g,
        label: compact ? `${g} — ${gradeLabel(gradeKeyOf5(g))}` : gradeLabel(gradeKeyOf5(g)),
        content: compact ? g : gradeLabel(gradeKeyOf5(g)),
        className: (on: boolean) =>
          `min-h-11 rounded-lg px-0.5 text-xs font-bold leading-tight disabled:opacity-60 ${
            on ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground"
          }`,
      }))}
    />
  );
}

/**
 * التقييم الاختياري (عام، تجويد، نطق، سلوك) مطويّاً تحت عنوانه: لا يظهر محتواه إلا بلمسة،
 * وعند الطيّ يبقى ملخص ما اختير ظاهراً بجانب العنوان.
 */
export function EvaluationSection({
  value,
  disabled,
  onChange,
}: {
  value: Evaluation;
  disabled: boolean;
  onChange: (c: (typeof EVAL_CRITERIA)[number], g: number | null) => void;
}) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  const chosen = EVAL_CRITERIA.filter((c) => value[c] != null);
  return (
    <section className="rounded-2xl border border-border/50 bg-muted/20">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? `${id}-body` : undefined}
          onClick={() => setOpen((o) => !o)}
          className="w-full min-h-12 px-3 flex items-center gap-2 text-start"
        >
          <Star className="w-4 h-4 text-gold-ink shrink-0" aria-hidden="true" />
          <span className="text-sm font-black text-foreground">
            {t("dailyRecord.detail.evaluation")}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              {t("dailyRecord.detail.optional")}
            </span>
          </span>
          <span className="flex-1 min-w-0 flex flex-wrap justify-end gap-1">
            {!open &&
              chosen.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-primary/12 text-primary px-2 py-0.5 text-xs font-bold tabular-nums"
                >
                  {t(`dailyRecord.eval.${c}`)} {value[c]}
                </span>
              ))}
          </span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </h3>
      {open && (
        <div id={`${id}-body`} className="px-3 pb-3 space-y-2 anim-float-in">
          {EVAL_CRITERIA.map((c) => (
            <div key={c} className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
              <span className="text-xs text-muted-foreground">{t(`dailyRecord.eval.${c}`)}</span>
              <GradePicker
                compact
                label={t(`dailyRecord.eval.${c}`)}
                value={value[c]}
                disabled={disabled}
                onChange={(g) => onChange(c, g)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * اختصارات المدى (DR-22): السورة كاملة، وإلى آخر الصفحة، و«+ صفحة» (تمدّ النهاية إلى آخر الصفحة التالية)،
 * و«بمقدار آخر حفظ» (1.14.0)، ومثل آخر مراجعة.
 */
export function RangeShortcuts({
  kind,
  s,
  range,
  set,
  direction = "forward",
}: {
  kind: DayKind;
  s: DayStudent;
  range: Partial<QuranRange>;
  direction?: RangeDirection;
  set: (r: Partial<QuranRange>) => void;
}) {
  const t = useT();
  const items = [
    { key: "wholeSurah", range: range.fromSurah ? wholeSurah(range.fromSurah) : null },
    {
      key: "pageEnd",
      range:
        range.fromSurah && range.fromAyah
          ? toPageEnd(range.fromSurah, range.fromAyah, direction)
          : null,
    },
    {
      key: "plusPage",
      range: (() => {
        if (validateRange(range)) return null;
        const r = range as QuranRange;
        const [ns, na] = nextPos([r.toSurah, r.toAyah], direction);
        if (ns === r.toSurah && na === r.toAyah) return null;
        const end = toPageEnd(ns, na, direction);
        return end ? { ...r, toSurah: end.toSurah, toAyah: end.toAyah } : null;
      })(),
    },
    {
      key: "sameAsLast",
      range: (() => {
        if (kind !== "memorize" || !s.last_memorize || !range.fromSurah || !range.fromAyah)
          return null;
        const r = suggestAmount(s.last_memorize, {
          fromSurah: range.fromSurah,
          fromAyah: range.fromAyah,
          toSurah: range.fromSurah,
        });
        return validateRange(r) ? null : (r as QuranRange);
      })(),
    },
    { key: "lastReview", range: kind === "review" ? rangeOfLast(s.last_review) : null },
  ].filter((x): x is { key: string; range: QuranRange } => !!x.range);
  if (!items.length) return null;
  return (
    <div
      role="group"
      aria-label={t("dailyRecord.shortcuts.label")}
      className="flex flex-wrap gap-1.5"
    >
      {items.map((x) => (
        <button
          key={x.key}
          type="button"
          onClick={() => set(x.range)}
          className="min-h-11 px-3 rounded-full bg-primary/10 text-primary text-xs font-bold"
        >
          {t(`dailyRecord.shortcuts.${x.key}`)}
        </button>
      ))}
    </div>
  );
}

/**
 * عدّاد الأخطاء أثناء التسميع (1.14.0): لمسة لكل خطأ، ومستوى الأداء يُقترح منه (gradeFromMistakes) ما لم
 * يختره المعلّم بيده. للمساعدة فقط: لا يُرسل العدد إلى الخادم.
 */
export function MistakeCounter({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  const t = useT();
  const btn =
    "min-h-11 min-w-11 rounded-xl bg-muted/60 text-foreground flex items-center justify-center disabled:opacity-50";
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <span className="flex-1 text-xs font-bold text-muted-foreground">
        {t("dailyRecord.mistakes.label")}
      </span>
      <button
        type="button"
        className={btn}
        disabled={disabled || value <= 0}
        onClick={() => onChange(value - 1)}
        aria-label={t("dailyRecord.mistakes.less")}
      >
        <Minus className="w-4 h-4" aria-hidden="true" />
      </button>
      <output
        aria-live="polite"
        className="min-w-8 text-center text-base font-black tabular-nums text-foreground"
      >
        {value}
      </output>
      <button
        type="button"
        className={`${btn} bg-destructive/12 text-destructive`}
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        aria-label={t("dailyRecord.mistakes.more")}
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

const ERROR_TYPES: ErrorType[] = ["none", "hifz", "tajweed", "tashkeel", "waqf"];

/** نوع الخطأ برقائق بلمسة واحدة بدل القائمة المنسدلة. */
export function ErrorChips({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: ErrorType;
  disabled: boolean;
  onChange: (e: ErrorType) => void;
}) {
  const t = useT();
  return (
    <RadioRow
      label={label}
      value={value}
      disabled={disabled}
      onSelect={onChange}
      className="flex flex-wrap gap-1.5"
      items={ERROR_TYPES.map((x) => ({
        value: x,
        label: t(`dailyRecord.errorTypes.${x}`),
        content: t(`dailyRecord.errorTypes.${x}`),
        className: (on: boolean) =>
          `min-h-11 px-3 rounded-full text-xs font-bold disabled:opacity-60 ${
            on ? "bg-foreground text-background" : "bg-muted/60 text-foreground"
          }`,
      }))}
    />
  );
}
