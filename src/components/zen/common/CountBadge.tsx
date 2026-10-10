import { capCount } from "@/lib/format";

/** شارة عدد موحَّدة بسقف 9+ (فحص الأقسام H3)، لا تظهر للصفر. */
export function CountBadge({ n, label }: { n: number; label?: string }) {
  if (n <= 0) return null;
  return (
    <span
      aria-label={label}
      className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[0.625rem] font-bold inline-flex items-center justify-center"
    >
      {capCount(n)}
    </span>
  );
}
