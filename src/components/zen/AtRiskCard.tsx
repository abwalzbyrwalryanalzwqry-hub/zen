import { Link } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { fetchAtRisk } from "@/lib/at-risk";

/** بطاقة الإنذار المبكر في رئيسية المعلّم (9.4): تظهر فقط إن وُجد طالب يحتاج متابعة. */
export function AtRiskCard({ userId }: { userId: string | null }) {
  const t = useT();
  const q = useQuery({
    queryKey: ["at-risk", userId],
    enabled: !!userId,
    staleTime: 10 * 60_000,
    queryFn: () => fetchAtRisk(null),
  });
  const n = q.data?.length ?? 0;
  if (!n) return null;
  const names = q
    .data!.slice(0, 3)
    .map((s) => s.name)
    .join(t("homes.listSep"));
  return (
    <Link
      to="/teacher/at-risk"
      className="block glass rounded-3xl p-4 border border-gold/40"
      aria-label={t("atRisk.aria", { n })}
    >
      <span className="flex items-center gap-2 text-sm font-black">
        <AlertTriangle className="w-5 h-5 text-gold shrink-0" aria-hidden="true" />
        <span className="flex-1">{t("atRisk.title", { n })}</span>
        <ChevronLeft className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
      </span>
      <span className="block text-[0.6875rem] text-muted-foreground mt-1 truncate">
        {names}
        {n > 3 ? " …" : ""}
      </span>
    </Link>
  );
}
