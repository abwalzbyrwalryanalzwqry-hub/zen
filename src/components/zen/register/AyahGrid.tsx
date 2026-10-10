import { Grid3x3, X } from "lucide-react";
import { useT } from "@/lib/i18n";

import { FirstUseTip } from "@/components/zen/common/FirstUseTip";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();
/**
 * شبكة أرقام آيات سورة واحدة (1..max) لاختيار رقم الآية بلمسة بدل كتابته. ما قبل min معطَّل (نهاية
 * لا تسبق البداية)، والمختار مميَّز، وما بين البداية والنهاية مظلَّل. تبقى الكتابة اليدوية في حقلها.
 */
export function AyahGrid({
  id,
  title,
  max,
  min = 1,
  value,
  inRange,
  onPick,
  onClose,
}: {
  id?: string;
  title: string;
  max: number;
  min?: number;
  value: number | undefined;
  inRange?: (n: number) => boolean;
  onPick: (n: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div
      id={id}
      role="group"
      aria-label={title}
      className="rounded-2xl border border-gold/30 bg-gold/5 p-2 space-y-2 anim-float-in"
    >
      <div className="flex items-center gap-2 ps-1">
        <Grid3x3 className="w-4 h-4 text-gold-ink" aria-hidden="true" />
        <p className="flex-1 text-xs font-bold text-foreground">
          {title}
          <span className="ms-1 font-normal text-muted-foreground tabular-nums">
            ({t("surahPicker.ayahs", { n: max })})
          </span>
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("dailyRecord.range.grid.close")}
          className="min-h-11 min-w-11 rounded-xl flex items-center justify-center text-muted-foreground"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <FirstUseTip id="ayahGrid" />
      <div className="grid grid-cols-7 gap-1 max-h-56 overflow-y-auto overscroll-contain p-0.5">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
          const current = value === n;
          return (
            <button
              key={n}
              type="button"
              disabled={n < min}
              aria-pressed={current}
              ref={current ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
              onClick={() => onPick(n)}
              className={`min-h-11 rounded-xl text-sm font-bold tabular-nums transition active:scale-95 disabled:opacity-30 ${
                current
                  ? "gradient-primary text-primary-foreground shadow-soft"
                  : inRange?.(n)
                    ? "bg-primary/15 text-primary"
                    : "bg-background/80 text-foreground border border-border/50"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
