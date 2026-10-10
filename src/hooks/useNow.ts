import { useEffect, useState } from "react";

/**
 * يعيد الرسم كل `ms` (دقيقة افتراضياً) لتتحدّث الأوقات النسبية («منذ دقيقة») دون إعادة تحميل
 * (فحص الأقسام P2). يتوقف والتطبيق في الخلفية، ويتحدّث فور العودة.
 */
export function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    const id = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ms]);
  return now;
}
