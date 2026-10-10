import { useState } from "react";
import { ALargeSmall, Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { FONT_SCALES, getFontScale, setFontScale, type FontScale } from "@/lib/a11y";
import { useT } from "@/lib/i18n";

/**
 * شريط سريع أعلى «المزيد» (تحليل «المزيد» GAP-03): أكثر ما يُغيَّر دون الدخول إلى التفضيلات — السمة، وحجم
 * الخط (يدور بين الأحجام). كل زر يعلن حالته (`aria-pressed` أو نصه).
 */
export function QuickBar() {
  const t = useT();
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const [font, setFont] = useState<FontScale>(() => getFontScale());
  const nextFont = () => {
    const i = FONT_SCALES.findIndex((f) => f.value === font);
    const v = FONT_SCALES[(i + 1) % FONT_SCALES.length].value;
    setFont(v);
    setFontScale(v);
  };
  const btn =
    "flex-1 min-h-12 rounded-2xl glass flex flex-col items-center justify-center gap-0.5 text-xs font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return (
    <div role="group" aria-label={t("more.quick.title")} className="flex gap-2">
      <button type="button" aria-pressed={dark} onClick={toggle} className={btn}>
        {dark ? (
          <Sun className="w-4 h-4 text-gold" aria-hidden="true" />
        ) : (
          <Moon className="w-4 h-4 text-primary" aria-hidden="true" />
        )}
        {t("more.quick.dark")}
      </button>
      <button
        type="button"
        onClick={nextFont}
        aria-label={t("more.quick.fontAria", {
          size: t(`accountSettings.display.fonts.${font}`),
        })}
        className={btn}
      >
        <ALargeSmall className="w-4 h-4 text-primary" aria-hidden="true" />
        {t(`accountSettings.display.fonts.${font}`)}
      </button>
    </div>
  );
}
