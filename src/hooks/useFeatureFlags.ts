import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useSession } from "@/hooks/useSession";
import {
  fetchFeatureFlags,
  isFeatureOn,
  readCachedFlags,
  type FeatureKey,
} from "@/lib/feature-flags";

/** `on(key)` حسب مفاتيح الميزات للحساب الحالي. الضيف ودون اتصال: آخر قيم محفوظة ثم الافتراضية. */
export function useFeatureFlags() {
  const { userId, guest } = useSession();
  const q = useQuery({
    queryKey: ["feature-flags"],
    queryFn: fetchFeatureFlags,
    enabled: !!userId && !guest,
    staleTime: 10 * 60_000,
    initialData: readCachedFlags,
    initialDataUpdatedAt: 0,
    retry: 1,
  });
  const flags = q.data;
  const on = useCallback(
    (key: FeatureKey) => isFeatureOn(flags, key, guest ? null : userId),
    [flags, guest, userId],
  );
  return { on, flags, refetch: q.refetch };
}
