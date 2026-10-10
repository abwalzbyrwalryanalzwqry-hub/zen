import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** حالة الفراغ الموحَّدة: أيقونة وجملة وإجراء اختياري، بدل سطر رمادي صغير مختلف في كل شاشة. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass rounded-3xl p-6 flex flex-col items-center text-center gap-2">
      <Icon className="w-6 h-6 text-primary/70" aria-hidden="true" />
      <p className="text-sm font-bold text-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>}
      {action}
    </div>
  );
}
