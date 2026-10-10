import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";
import {
  EMPTY_CONTEXT,
  fetchHomeContext,
  resolveHomeMode,
  type HomeContext,
  type HomeMode,
} from "@/lib/home";
import { readLocal, writeLocal } from "@/lib/storage";

const MODE_KEY = "zen-home-mode";

function cachedMode(): HomeMode {
  const m = readLocal(MODE_KEY);
  return m === "teacher" || m === "guardian" ? m : "student";
}

/**
 * سياق الشاشة الرئيسية والشريط السفلي: نداء واحد يُخزَّن 5 دقائق.
 * آخر واجهة معروفة تُحفظ محلياً كي لا يومض الشريط بواجهة الطالب عند كل فتح.
 */
export function useHomeContext() {
  const { userId, guest } = useSession();
  const q = useQuery({
    queryKey: ["home-context", userId],
    enabled: !!userId && !guest,
    staleTime: 5 * 60_000,
    queryFn: fetchHomeContext,
  });
  const ctx: HomeContext = q.data ?? EMPTY_CONTEXT;
  const mode: HomeMode = q.isSuccess ? resolveHomeMode(ctx) : cachedMode();
  useEffect(() => {
    if (q.isSuccess) writeLocal(MODE_KEY, mode);
  }, [q.isSuccess, mode]);
  return { ctx, mode, ready: q.isSuccess, userId, guest, refetch: q.refetch };
}
