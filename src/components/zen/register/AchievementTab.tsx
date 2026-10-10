import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";

// سجل الإنجاز وقاموسه يُحمَّلان عند فتح تبويبه فقط (لا يثقلان تسجيل اليوم).
const AchievementLog = lazy(() =>
  import("@/components/zen/reports/AchievementLog").then((m) => ({ default: m.AchievementLog })),
);

/** تبويب «سجل الإنجاز» في السجل اليومي. */
export function AchievementTab({ halaqa, today }: { halaqa: string; today: string }) {
  const t = useT();
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-10" role="status" aria-label={t("common.loading")}>
          <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
        </div>
      }
    >
      <AchievementLog halaqa={halaqa} today={today} />
    </Suspense>
  );
}
