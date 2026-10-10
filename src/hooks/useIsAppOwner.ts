import { useQuery } from "@tanstack/react-query";
import { isAppOwner } from "@/lib/app-health";
import { useSession } from "@/hooks/useSession";

/**
 * هل صاحب الجلسة مالك التطبيق؟ مخزَّن بـ react-query (تحليل «المزيد» PERF-01): كان يُطلب في كل فتح لـ«المزيد»
 * بـ useEffect بلا ذاكرة. الضيف لا يُسأل عنه.
 */
export function useIsAppOwner(): boolean {
  const { userId, guest } = useSession();
  const q = useQuery({
    queryKey: ["is-app-owner", userId],
    queryFn: isAppOwner,
    enabled: !!userId && !guest,
    staleTime: 30 * 60_000,
  });
  return q.data === true;
}
