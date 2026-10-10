import { useEffect, useState } from "react";
import { readLocal, writeLocal } from "@/lib/storage";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = readLocal("zen-theme") as Theme | null;
  return stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

/** الوضع الفاتح/الداكن محفوظاً في `zen-theme` (مفصول عن مكوّن الزر لأجل Fast Refresh، L4). */
export function useTheme() {
  // يُقرأ عند أول عرض (M12)، والأثر يزامن صنف الصفحة فقط.
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    writeLocal("zen-theme", next);
  };
  return { theme, toggle };
}
