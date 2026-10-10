import { useState } from "react";
import { Icon } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toArabicDigits } from "@/lib/quran";
import { SURAH_META } from "@/lib/quran/metadata";
import { useT } from "@/lib/i18n";
import { ensureMushafDict } from "@/lib/quran/mushaf-i18n";

// قاموس القارئ الكسول: يُضاف متزامناً قبل أول رسم.
void ensureMushafDict();

/** خيارات العدد: القيمة والتسمية (مفتاح ترجمة أو رقم). */
const RANGE_TIMES = [1, 3, 5, 10, 0] as const;
const AYAH_TIMES = [1, 2, 3, 5, 7] as const;

export interface RangeExtra {
  toSurah?: number;
  ayahTimes?: number;
}

/** رقم من نص المستخدم (أرقام عربية أو لاتينية)، أو NaN. */
function parseCount(raw: string): number {
  const latin = raw.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).trim();
  return /^\d+$/.test(latin) ? Number(latin) : Number.NaN;
}

/**
 * تكرار مقطع (للحفظ والمراجعة).
 * الحقل يحفظ ما يكتبه المستخدم نصاً ولا يُقيَّد إلا عند الخروج منه أو البدء
 * (كان كتابة «25» تعطي «125» لأن الحقل يُقيَّد بـ١ مع كل حرف).
 */
export function RangeDialog({
  target,
  onClose,
  onStart,
}: {
  target: { surah: number; from: number } | null;
  onClose: () => void;
  onStart: (surah: number, from: number, to: number, times: number, extra: RangeExtra) => void;
}) {
  const t = useT();
  const surah = target?.surah ?? 1;
  const [toSurah, setToSurah] = useState(surah);
  const maxFrom = SURAH_META[surah - 1].ayatCount;
  const maxTo = SURAH_META[toSurah - 1].ayatCount;
  const [from, setFrom] = useState(String(target?.from ?? 1));
  const [to, setTo] = useState(String(target ? Math.min(maxFrom, target.from + 4) : 1));
  const [times, setTimes] = useState(3);
  const [ayahTimes, setAyahTimes] = useState(1);
  // هدف جديد ⇒ نطاق افتراضي جديد، أثناء العرض لا في أثر (React: «تعديل الحالة عند تغيّر الخصائص»).
  const [shownFor, setShownFor] = useState(target);
  if (target !== shownFor) {
    setShownFor(target);
    if (target) {
      const max = SURAH_META[target.surah - 1].ayatCount;
      setToSurah(target.surah);
      setFrom(String(target.from));
      setTo(String(Math.min(max, target.from + 4)));
    }
  }
  const clampTo = (raw: string, max: number) => {
    const n = parseCount(raw);
    return Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : 1;
  };
  const fromN = clampTo(from, maxFrom);
  const toN = clampTo(to, maxTo);
  const sameSurah = toSurah === surah;
  const invalid = sameSurah && toN < fromN;

  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    max: number,
  ) => {
    const n = clampTo(value, max);
    const stepBtn = (delta: number, icon: string, aria: string) => (
      <button
        type="button"
        onClick={() => set(String(Math.min(max, Math.max(1, n + delta))))}
        disabled={(delta < 0 && n <= 1) || (delta > 0 && n >= max)}
        aria-label={aria}
        className="flex h-10 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/60 transition active:scale-95 disabled:opacity-40"
      >
        <Icon d={icon} size={15} />
      </button>
    );
    return (
      <div className="grid min-w-0 gap-1 text-[0.6875rem] text-muted-foreground">
        <label htmlFor={id}>{label}</label>
        <div className="flex min-w-0 items-center gap-1">
          {stepBtn(-1, icons.minus, t("mushafReader.range.dec", { label }))}
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={value}
            onChange={(e) => set(e.target.value.replace(/[^\d\u0660-\u0669]/g, "").slice(0, 3))}
            onBlur={() => set(String(n))}
            onFocus={(e) => e.currentTarget.select()}
            size={3}
            className="w-full min-w-0 flex-1 rounded-2xl border border-border/60 bg-background/70 px-1 py-2 text-center text-base text-foreground tabular-nums outline-none focus:border-primary/50"
            dir="ltr"
          />
          {stepBtn(1, icons.plus, t("mushafReader.range.inc", { label }))}
        </div>
      </div>
    );
  };

  const choice = (
    aria: string,
    values: readonly number[],
    current: number,
    set: (n: number) => void,
    label: (n: number) => string,
  ) => (
    <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={aria}>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={current === v}
          onClick={() => set(v)}
          className={`rounded-xl border py-2 text-[0.75rem] font-medium transition active:scale-95 ${
            current === v
              ? "border-primary/50 bg-primary/15 text-primary"
              : "border-border/60 bg-background/60"
          }`}
        >
          {label(v)}
        </button>
      ))}
    </div>
  );

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[92dvh] max-w-sm overflow-y-auto rounded-3xl border-border/60 bg-card/95 backdrop-blur-2xl sm:rounded-3xl"
        dir="rtl"
      >
        <DialogHeader className="text-right">
          <DialogTitle className="font-display text-xl">
            {t("mushafReader.range.title")}
          </DialogTitle>
          <p className="text-[0.6875rem] text-muted-foreground">
            {t("mushafReader.range.subtitle", {
              surah: SURAH_META[surah - 1].nameAr,
              n: toArabicDigits(maxFrom),
            })}
          </p>
        </DialogHeader>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          {field("range-from", t("mushafReader.range.from"), from, setFrom, maxFrom)}
          {field("range-to", t("mushafReader.range.to"), to, setTo, maxTo)}
        </div>
        <label className="grid gap-1 text-[0.6875rem] text-muted-foreground">
          {t("mushafReader.range.toSurah")}
          <select
            value={toSurah}
            onChange={(e) => {
              const next = Number(e.target.value);
              setToSurah(next);
              setTo(String(SURAH_META[next - 1].ayatCount));
            }}
            className="w-full rounded-2xl border border-border/60 bg-background/70 px-3 py-2.5 text-sm text-foreground outline-none"
            dir="rtl"
          >
            {SURAH_META.slice(surah - 1, Math.min(114, surah + 19)).map((s) => (
              <option key={s.id} value={s.id}>
                {toArabicDigits(s.id)}. {s.nameAr}
              </option>
            ))}
          </select>
        </label>
        {invalid && (
          <p className="text-[0.6875rem] text-destructive" role="alert">
            {t("mushafReader.range.invalid")}
          </p>
        )}
        <div className="grid gap-1.5">
          <div className="text-[0.6875rem] text-muted-foreground">
            {t("mushafReader.range.times")}
          </div>
          {choice(t("mushafReader.range.times"), RANGE_TIMES, times, setTimes, (v) =>
            v === 0
              ? t("mushafReader.range.forever")
              : v === 1
                ? t("mushafReader.range.once")
                : toArabicDigits(v),
          )}
        </div>
        <div className="grid gap-1.5">
          <div className="text-[0.6875rem] text-muted-foreground">
            {t("mushafReader.range.ayahTimes")}
          </div>
          {choice(t("mushafReader.range.ayahTimes"), AYAH_TIMES, ayahTimes, setAyahTimes, (v) =>
            v === 1 ? t("mushafReader.range.once") : `×${toArabicDigits(v)}`,
          )}
        </div>
        <button
          type="button"
          disabled={invalid}
          onClick={() => {
            if (!target || invalid) return;
            setFrom(String(fromN));
            setTo(String(toN));
            onStart(surah, fromN, toN, times, {
              toSurah: sameSurah ? undefined : toSurah,
              ayahTimes,
            });
          }}
          className="gradient-primary rounded-2xl py-3 text-sm font-medium text-primary-foreground shadow-glow transition active:scale-[0.98] disabled:opacity-50"
        >
          {t("mushafReader.range.start")}
        </button>
      </DialogContent>
    </Dialog>
  );
}
