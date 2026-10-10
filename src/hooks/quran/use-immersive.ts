// ============================================================
// Zen — وضع ملء الشاشة للقارئ
// ------------------------------------------------------------
// يخفي عناصر الواجهة ليبقى النص وحده، ويخفي شريط الحالة في أندرويد
// (أو يطلب ملء الشاشة في المتصفح). زر الرجوع ومفتاح Esc يخرجان منه
// أولاً قبل مغادرة الشاشة، ويُلغى تلقائياً عند مغادرة القارئ.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { addBackInterceptor, isNativeApp, setImmersiveChrome } from "@/lib/quran/native-shell";

export function useImmersive() {
  const [on, setOn] = useState(false);

  const enter = useCallback(() => {
    setOn(true);
    void setImmersiveChrome(true);
  }, []);
  const exit = useCallback(() => {
    setOn(false);
    void setImmersiveChrome(false);
  }, []);
  const toggle = useCallback(() => (on ? exit() : enter()), [on, enter, exit]);

  useEffect(() => {
    if (!on) return;
    const removeBack = addBackInterceptor(() => {
      exit();
      return true;
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exit();
    };
    // الخروج من ملء الشاشة بوسيلة المتصفح نفسه ينهي الوضع الغامر أيضاً.
    let wasFull = false;
    const onFs = () => {
      if (document.fullscreenElement) wasFull = true;
      else if (wasFull && !isNativeApp()) setOn(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      removeBack();
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [on, exit]);

  // مغادرة القارئ وهو في ملء الشاشة: استعادة شريط الحالة.
  useEffect(() => () => void setImmersiveChrome(false), []);

  return { immersive: on, enter, exit, toggle };
}
