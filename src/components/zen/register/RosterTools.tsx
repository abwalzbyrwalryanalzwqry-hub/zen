import { Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { STUDENT_FILTERS, type StudentFilter } from "@/lib/daily-record";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

/**
 * أدوات القائمة (DR-09): البحث بالاسم ورقائق التصفية في سطرين ثابتين أعلى القائمة. «الجميع حاضر» انتقل إلى
 * الشريط السفلي (1.14.0).
 */
export function RosterTools({
  query,
  onQuery,
  filter,
  onFilter,
  counts,
}: {
  query: string;
  onQuery: (q: string) => void;
  filter: StudentFilter;
  onFilter: (f: StudentFilter) => void;
  counts: Record<StudentFilter, number>;
}) {
  const t = useT();
  return (
    <div className="sticky top-0 z-10 -mx-3 space-y-1.5 bg-background/90 px-3 py-1.5 backdrop-blur">
      <label className="relative block">
        <span className="sr-only">{t("dailyRecord.search.label")}</span>
        <Search
          className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("dailyRecord.search.placeholder")}
          className="w-full min-h-11 rounded-2xl glass ps-9 pe-3 text-sm"
        />
      </label>
      <div
        role="group"
        aria-label={t("dailyRecord.filter.label")}
        className="flex gap-1.5 overflow-x-auto pb-0.5"
      >
        {STUDENT_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => onFilter(f)}
            className={`shrink-0 min-h-11 px-3 rounded-full text-xs font-bold tabular-nums ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground"
            }`}
          >
            {t(`dailyRecord.filter.${f}`)} ({counts[f]})
          </button>
        ))}
      </div>
    </div>
  );
}
