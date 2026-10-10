import { useQuery } from "@tanstack/react-query";
import { HalaqaLeague } from "@/components/zen/center/HalaqaLeague";
import { fetchMyLeagues } from "@/lib/center-insights";
import { useT } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";

/** دوري الحلقات في صفحة الإنجازات (1.20.0): لكل مركز فعّله ويدرس فيه المستخدم أو يدرّس. حلقته مظلّلة. */
export function MyLeagues() {
  usePagesDict();
  const t = useT();
  const q = useQuery({
    queryKey: ["my-halaqa-leagues"],
    queryFn: () => fetchMyLeagues(30),
    retry: false,
    staleTime: 10 * 60_000,
  });
  if (!q.data?.length) return null;
  return (
    <>
      {q.data.map((l) => (
        <HalaqaLeague
          key={l.center_id}
          league={l}
          title={t("centerInsights.league.titleCenter", { center: l.center_name })}
        />
      ))}
    </>
  );
}
