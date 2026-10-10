import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

/** مربع مؤشر قابل للنقر (رئيسية المعلّم): الرقم كبير، والعنوان تحته، ويقود إلى مكان العمل. */
export function StatTile({
  to,
  search,
  icon: Icon,
  value,
  label,
  tone = "default",
}: {
  to: string;
  search?: Record<string, string>;
  icon: LucideIcon;
  value: string;
  label: string;
  tone?: "default" | "warn";
}) {
  return (
    <Link
      to={to}
      search={search}
      className={`glass rounded-2xl p-3 flex flex-col gap-1 min-w-0 active:scale-[0.98] transition ${
        tone === "warn" ? "border border-gold/40" : ""
      }`}
    >
      <Icon
        className={`w-4 h-4 ${tone === "warn" ? "text-gold" : "text-primary"}`}
        aria-hidden="true"
      />
      <span className="text-xl font-black text-foreground tabular-nums">{value}</span>
      <span className="text-[0.6875rem] text-muted-foreground leading-tight">{label}</span>
    </Link>
  );
}
