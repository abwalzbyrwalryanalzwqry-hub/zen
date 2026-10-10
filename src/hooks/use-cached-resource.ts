import { useEffect, useMemo, useState } from "react";
import { useLatest } from "@/hooks/use-latest";

export type ResourceState<T> =
  | { status: "loading"; data: undefined; error: undefined }
  | { status: "ready"; data: T; error: undefined }
  | { status: "error"; data: undefined; error: Error };

const LOADING = { status: "loading", data: undefined, error: undefined } as const;

/**
 * مورد محلي له ذاكرة مؤقتة (نص سورة، صفحة مصحف، تفسير) — M12: الحالة مشتقة من المفتاح بدل أثر يصفّرها عند
 * تغيّره. ما في الذاكرة يظهر فوراً في العرض نفسه، والتحميل يكمل في الأثر، والنتيجة المتأخرة لمفتاح قديم تُهمل.
 * المفتاح يشمل رقم المحاولة كي تعيد «إعادة المحاولة» التحميل.
 */
export function useCachedResource<T>(
  key: string,
  getCached: () => T | null | undefined,
  load: () => Promise<T>,
): ResourceState<T> {
  const fns = useLatest({ getCached, load });
  const [res, setRes] = useState<{ key: string; state: ResourceState<T> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fns.current.load().then(
      (data) => {
        if (!cancelled) setRes({ key, state: { status: "ready", data, error: undefined } });
      },
      (error: unknown) => {
        if (!cancelled)
          setRes({
            key,
            state: {
              status: "error",
              data: undefined,
              error: error instanceof Error ? error : new Error(String(error)),
            },
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, fns]);

  const fresh = res?.key === key ? res.state : null;
  // getCached يتبع المفتاح؛ يُحسب مرة لكل مفتاح/نتيجة فتبقى هوية الحالة ثابتة بين العروض.
  return useMemo<ResourceState<T>>(() => {
    if (fresh) return fresh;
    const cached = getCached();
    return cached ? { status: "ready", data: cached, error: undefined } : LOADING;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fresh]);
}
