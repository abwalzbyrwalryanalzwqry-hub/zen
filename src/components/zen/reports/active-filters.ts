import type { ReportConfig } from "@/lib/reports/config";

/** عدد التصفيات الفعلية (للسطر في الشاشة الأولى). */
export function activeFilters(cfg: ReportConfig): number {
  return (
    (cfg.status !== "all" ? 1 : 0) +
    (cfg.grade !== "all" ? 1 : 0) +
    (cfg.achievement !== "all" ? 1 : 0) +
    (cfg.weekdays ? 1 : 0)
  );
}
