import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { myManagedCenters } from "@/lib/center";
import { useT } from "@/lib/i18n";

/** مدخل «دفتر الرسوم» في لوحة المركز (1.21.0): لمنشئ المركز ومديره وحدهما، فالمشرف لا يرى المال. */
export function CenterFeesLink({ centerId }: { centerId: string }) {
  const t = useT();
  const q = useQuery({
    queryKey: ["my-managed-centers"],
    queryFn: () => myManagedCenters(),
    staleTime: 5 * 60_000,
  });
  const role = q.data?.find((c) => c.center_id === centerId)?.role;
  if (role !== "owner" && role !== "manager") return null;
  return (
    <Link
      to="/center/$centerId/fees"
      params={{ centerId }}
      data-testid="center-fees-link"
      className="w-full py-2.5 rounded-xl glass-strong text-xs text-primary font-bold flex items-center justify-center gap-1.5"
    >
      <Wallet className="w-4 h-4" aria-hidden="true" /> {t("more.links.fees.label")}
    </Link>
  );
}
