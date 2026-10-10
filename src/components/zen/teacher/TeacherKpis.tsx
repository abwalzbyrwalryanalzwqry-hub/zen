import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarCheck, ClipboardList, Mic } from "lucide-react";
import { StatTile } from "@/components/zen/common/StatTile";
import { QueryError } from "@/components/zen/QueryError";
import { attendanceRatio, fetchTeacherKpis } from "@/lib/teacher-board";
import { capCount } from "@/lib/format";
import { useT } from "@/lib/i18n";

/**
 * مؤشرات رئيسية المعلّم (فحص الأقسام P1): أربعة أرقام من الخادم، كل منها يقود إلى مكان العمل،
 * بدل قائمة روابط تكرّر الشريط السفلي.
 */
export function TeacherKpis({ userId }: { userId: string | null }) {
  const t = useT();
  const q = useQuery({
    queryKey: ["teacher-kpis", userId],
    enabled: !!userId,
    retry: 1,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: fetchTeacherKpis,
  });
  if (q.isError) return <QueryError compact onRetry={() => void q.refetch()} />;
  const k = q.data;
  const v = (n: number | undefined) => (n == null ? "…" : capCount(n));
  return (
    <section aria-label={t("kpis.title")} className="grid grid-cols-2 gap-2">
      <StatTile
        to="/teacher"
        search={{ tab: "review" }}
        icon={Mic}
        value={v(k?.pending_recitations)}
        label={t("kpis.pending")}
      />
      <StatTile
        to="/teacher/register"
        icon={CalendarCheck}
        value={k ? attendanceRatio(k) : "…"}
        label={t("kpis.attendance")}
      />
      <StatTile
        to="/teacher"
        search={{ tab: "assign" }}
        icon={ClipboardList}
        value={v(k?.due_assignments)}
        label={t("kpis.due")}
      />
      <StatTile
        to="/teacher/at-risk"
        icon={AlertTriangle}
        value={v(k?.at_risk)}
        label={t("kpis.atRisk")}
        tone={k && k.at_risk > 0 ? "warn" : "default"}
      />
    </section>
  );
}
