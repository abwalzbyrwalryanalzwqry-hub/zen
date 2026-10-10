import { useAchievements } from "@/hooks/useAchievements";
import { ChallengesCard } from "@/components/zen/achievements/Challenges";
import { HonorBoardCard } from "@/components/zen/achievements/HalaqaBoards";
import { StreakCard } from "@/components/zen/achievements/StreakAndBadges";
/** لوحة الشرف والتحديات لحلقة واحدة. */
export function HalaqaMotivation({ halaqaId, userId }: { halaqaId: string; userId: string }) {
  return (
    <div className="space-y-2">
      <HonorBoardCard halaqaId={halaqaId} />
      <ChallengesCard halaqaId={halaqaId} userId={userId} />
    </div>
  );
}

/** بطاقة السلسلة المختصرة في «اليوم». */
export function TodayStreakCard({ userId }: { userId: string }) {
  const { data, reload } = useAchievements(userId);
  return <StreakCard userId={userId} data={data} onChange={reload} compact />;
}

// الأجزاء مفصولة في `components/zen/achievements/` (M5)؛ هذا الملف يبقى نقطة الاستيراد نفسها.
export {
  AchievementsSummary,
  BadgesView,
  CertificatesList,
  StreakCard,
} from "@/components/zen/achievements/StreakAndBadges";
export {
  HonorBoardCard,
  PendingCertificatesCard,
} from "@/components/zen/achievements/HalaqaBoards";
export { ChallengesCard } from "@/components/zen/achievements/Challenges";
