/**
 * تفضيلات العرض (المرحلة 9): حجم الخط والتباين العالي. تُحفظ محلياً وتُطبَّق على <html>
 * قبل أول رسم عبر سكربت الرأس في __root.tsx، ومن هنا عند التغيير.
 */
export type FontScale = "sm" | "md" | "lg" | "xl";

export const FONT_SCALES: { value: FontScale; label: string }[] = [
  { value: "sm", label: "صغير" },
  { value: "md", label: "عادي" },
  { value: "lg", label: "كبير" },
  { value: "xl", label: "كبير جداً" },
];

export function parseFontScale(v: string | null): FontScale {
  return v === "sm" || v === "lg" || v === "xl" ? v : "md";
}

export function getFontScale(): FontScale {
  if (typeof localStorage === "undefined") return "md";
  return parseFontScale(localStorage.getItem("zen-font"));
}

/** اختار المستخدم حجماً بنفسه؟ عندها لا يُطبَّق خط النظام فوق اختياره (H5). */
export const FONT_CHOSEN_KEY = "zen-font-chosen";
export function isFontScaleChosen(): boolean {
  try {
    return localStorage.getItem(FONT_CHOSEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setFontScale(v: FontScale, opts: { fromSystem?: boolean } = {}): void {
  if (!opts.fromSystem) {
    try {
      localStorage.setItem(FONT_CHOSEN_KEY, "1");
    } catch {
      /* لا شيء */
    }
  }
  if (v === "md") {
    localStorage.removeItem("zen-font");
    delete document.documentElement.dataset.font;
  } else {
    localStorage.setItem("zen-font", v);
    document.documentElement.dataset.font = v;
  }
}

export function getHighContrast(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem("zen-contrast") === "high";
}

export function setHighContrast(on: boolean): void {
  if (on) localStorage.setItem("zen-contrast", "high");
  else localStorage.removeItem("zen-contrast");
  document.documentElement.classList.toggle("hc", on);
}
