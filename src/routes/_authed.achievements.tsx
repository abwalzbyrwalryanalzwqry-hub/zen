import { useT, t as tStatic } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { QueryError } from "@/components/zen/QueryError";
import { Loader2 } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import {
  BadgesView,
  CertificatesList,
  HalaqaMotivation,
  StreakCard,
} from "@/components/zen/Achievements";
import { useAchievements } from "@/hooks/useAchievements";
import { myAchievementHalaqat, type AchievementHalaqa } from "@/lib/achievements";
import { useSession } from "@/hooks/useSession";
import { FamilyGoals } from "@/components/zen/FamilyGoals";
import { StudentCertificates } from "@/components/zen/certificates/StudentCertificates";
import { MyLeagues } from "@/components/zen/achievements/MyLeagues";

export const Route = createFileRoute("/_authed/achievements")({
  head: () => ({ meta: [{ title: tStatic("meta.achievements") }] }),
  component: AchievementsScreen,
});

function AchievementsScreen() {
  const t = useT();
  const { userId } = useSession();
  const { data, err, reload } = useAchievements(userId);
  // react-query بدل useEffect (تحليل «المزيد» ARC-04): ذاكرة بين الزيارات، والفشل لا يخفي الصفحة.
  const halaqatQ = useQuery({
    queryKey: ["achievement-halaqat", userId],
    queryFn: myAchievementHalaqat,
    enabled: !!userId,
  });
  const halaqat: AchievementHalaqa[] = halaqatQ.data ?? [];

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col min-h-0">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <div>
            <h1 className="text-xl font-black text-foreground">{t("achievementsPage.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("achievementsPage.subtitle")}</p>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
          {err && !data && <QueryError onRetry={reload} />}
          {err && data && <p className="text-xs text-destructive px-2">{err}</p>}
          {!data && !err ? (
            <div
              className="flex justify-center py-12"
              role="status"
              aria-label={t("common.loading")}
            >
              <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
            </div>
          ) : data && userId ? (
            <>
              <StreakCard userId={userId} data={data} onChange={reload} />
              <BadgesView data={data} />
              <FamilyGoals studentId={userId} mode="student" />
              <StudentCertificates studentId={userId} />
              <CertificatesList certs={data.certificates} canShare />
              <Link
                to="/verify"
                className="block text-center text-xs text-primary font-bold min-h-11 py-3"
              >
                {t("achievementsPage.verify")}
              </Link>
              <MyLeagues />
              {halaqat.map((h) => (
                <div key={h.halaqa_id} className="glass-strong rounded-3xl p-4 space-y-2">
                  <p className="text-sm font-black text-foreground">{h.halaqa_name}</p>
                  <HalaqaMotivation halaqaId={h.halaqa_id} userId={userId} />
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>
    </PhoneFrame>
  );
}
