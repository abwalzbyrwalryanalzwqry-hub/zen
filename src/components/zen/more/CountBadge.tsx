import { badgeText } from "@/lib/more-badges";
import { useT } from "@/lib/i18n";

/**
 * شارة عدد بجانب مدخل «المزيد» (GAP-01). الرقم ظاهر للعين، ونصّه الكامل لقارئ الشاشة («3 جديدة»)
 * فيُقرأ ضمن اسم الرابط. لا شيء حين يكون العدد صفراً.
 */
export function CountBadge({
  count,
  tone = "primary",
}: {
  count: number;
  tone?: "primary" | "danger";
}) {
  const t = useT();
  if (count <= 0) return null;
  return (
    <span
      data-testid="more-badge"
      className={`min-w-6 h-6 px-1.5 shrink-0 rounded-full text-xs font-black tabular-nums flex items-center justify-center ${
        tone === "danger" ? "bg-destructive text-white" : "bg-primary text-primary-foreground"
      }`}
    >
      <span aria-hidden="true">{badgeText(count)}</span>
      <span className="sr-only">{t("more.badges.aria", { n: count })}</span>
    </span>
  );
}
