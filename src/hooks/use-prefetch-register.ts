import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { localDayKey } from "@/lib/local-day";
import { isOnline } from "@/lib/network";

/**
 * تحميل مسبق للسجل اليومي (1.17.0، المرحلة 1؛ docs/PERFORMANCE.md).
 *
 * فتح السجل كان سلسلة متتابعة: حزمة الشاشة وتوابعها (~40 ملفاً) ثم ورقة اليوم ثم الرسم — نحو 0.8 ثانية
 * قبل أول صف على جهاز ضعيف. حين تهدأ الشاشة الرئيسية للمعلّم تُحمَّل حزمة السجل، وورقة اليوم لحلقات اليوم
 * (حتى حلقتين) إلى ذاكرة React Query بالمفتاح نفسه، فيفتح السجل مما في الذاكرة ثم يتحدّث كالمعتاد.
 */
export function usePrefetchRegister(halaqaIds: readonly string[], enabled = true): void {
  const router = useRouter();
  const qc = useQueryClient();
  const ids = halaqaIds.slice(0, 2).join(",");
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void router.preloadRoute({ to: "/teacher/register" }).catch(() => undefined);
      if (!ids || !isOnline()) return;
      void import("@/hooks/use-daily-record").then(({ dailyKey, loadDailySheet }) => {
        const date = localDayKey();
        for (const h of ids.split(",")) {
          if (cancelled) return;
          void qc.prefetchQuery({
            queryKey: dailyKey(h, date),
            queryFn: () => loadDailySheet(h, date),
          });
        }
      });
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 3000 });
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(id);
      };
    }
    const id = window.setTimeout(run, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [router, qc, ids, enabled]);
}
