import { useState } from "react";
import { Eye } from "lucide-react";
import { useT } from "@/lib/i18n";
import { fmtNum } from "@/lib/reports/format";
import { rangeError, type ReportConfig } from "@/lib/reports/config";
import type { ReportData } from "@/lib/reports/types";
import { KindPicker, RangePicker, RowButton, SectionChips, type Patch } from "./ReportSteps";
import { StudentsSheet } from "./ReportStudents";
import { activeFilters } from "./active-filters";

/** هل تكفي الإعدادات لمعاينة التقرير؟ */
function setupReady(cfg: ReportConfig): boolean {
  return (
    !rangeError(cfg) &&
    cfg.records.length > 0 &&
    cfg.students?.length !== 0 &&
    cfg.weekdays?.length !== 0
  );
}

/**
 * الشاشة الأولى (1.15.0): «ماذا تريد أن تطبع؟» — النوع والفترة والطلاب والأقسام في شاشة واحدة، وزر
 * «معاينة» ثابت أسفلها. الطلاب والتصفية والتاريخ المخصص أنصاف شاشات عند الحاجة.
 */
export function ReportSetup({
  cfg,
  patch,
  today,
  data,
  onPreview,
  shortcuts,
}: {
  shortcuts?: React.ReactNode;
  cfg: ReportConfig;
  patch: Patch;
  today: string;
  data: ReportData | undefined;
  onPreview: () => void;
}) {
  const t = useT();
  const [students, setStudents] = useState(false);
  const pool = (data?.students ?? []).filter((s) => !cfg.activeOnly || s.member);
  const n = cfg.students ? pool.filter((s) => cfg.students!.includes(s.id)).length : pool.length;
  const filters = activeFilters(cfg);
  const who = cfg.students
    ? t("reports.setup.someStudents", { n: fmtNum(n, cfg.digits, 0) })
    : data
      ? t("reports.setup.allStudents", { n: fmtNum(n, cfg.digits, 0) })
      : t("reports.students.all");
  return (
    <div className="space-y-4">
      {shortcuts}
      <Block title={t("reports.step.kind")}>
        <KindPicker cfg={cfg} patch={patch} />
      </Block>
      <Block title={t("reports.range.label")}>
        <RangePicker cfg={cfg} patch={patch} today={today} />
      </Block>
      <Block title={t("reports.step.students")}>
        <RowButton
          label={who}
          value={filters ? t("reports.setup.filters", { n: fmtNum(filters, cfg.digits, 0) }) : ""}
          onClick={() => setStudents(true)}
        />
      </Block>
      <Block title={t("reports.setup.sections")}>
        <SectionChips cfg={cfg} patch={patch} />
      </Block>
      <div className="sticky bottom-0 -mx-3 px-3 pt-2 pb-3 bg-background/90 backdrop-blur border-t border-border/60">
        <button
          type="button"
          onClick={onPreview}
          disabled={!setupReady(cfg)}
          className="w-full min-h-12 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Eye className="w-4 h-4" aria-hidden="true" />
          {t("reports.wizard.preview")}
        </button>
      </div>
      <StudentsSheet
        open={students}
        onClose={() => setStudents(false)}
        cfg={cfg}
        patch={patch}
        data={data}
      />
    </div>
  );
}

export function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-1.5">
      <h3 className="text-xs font-bold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
