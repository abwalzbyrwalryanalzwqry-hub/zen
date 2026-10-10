import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";
import { fetchMoreBadges, NO_BADGES, type MoreBadges } from "@/lib/more-badges";

/**
 * شارات «المزيد» لصاحب الجلسة. دقيقة واحدة في الذاكرة، وتُحدَّث عند العودة إلى التطبيق. الفشل لا يُظهر خطأً:
 * الشارة إضافة لا تمنع القائمة، فتختفي ببساطة.
 */
export function useMoreBadges(): MoreBadges {
  const { userId, guest } = useSession();
  const q = useQuery({
    queryKey: ["more-badges", userId],
    queryFn: fetchMoreBadges,
    enabled: !!userId && !guest,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return q.data ?? NO_BADGES;
}
