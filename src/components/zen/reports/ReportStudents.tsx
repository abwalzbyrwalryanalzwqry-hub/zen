import { useState, type ReactNode } from "react";
import { Check, Search } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { normalizeName } from "@/lib/daily-record";
import { fmtNum } from "@/lib/reports/format";
import type { ReportConfig } from "@/lib/reports/config";
import type { ReportData, ReportStudent } from "@/lib/reports/types";
import type {
  AchievementFilter,
  GradeFilter,
  SortMode,
  StudentStatusFilter,
} from "@/lib/reports/calc";
import { Choice, inputCls, Toggle } from "./parts";
import type { Patch } from "./ReportSteps";

const STATUS: StudentStatusFilter[] = ["all", "regular", "followUp", "lowAttendance", "advanced"];
const GRADES: GradeFilter[] = ["all", 5, 4, 3, 2, 1];
const ACH: AchievementFilter[] = ["all", "hasAchievements", "noProgress", "stalled"];
const SORTS: SortMode[] = ["circle", "nameAsc", "nameDesc", "topAchievement", "lowAttendance"];

/**
 * نصف شاشة «الطلاب» (1.15.0): الجميع أو اختيار يدوي ببحث وتحديد الكل، ثم التصفية والترتيب وأيام الحلقة
 * شرائح بدل القوائم المنسدلة وخطوة «الفترات» المستقلة.
 */
export function StudentsSheet({
  open,
  onClose,
  cfg,
  patch,
  data,
}: {
  open: boolean;
  onClose: () => void;
  cfg: ReportConfig;
  patch: Patch;
  data: ReportData | undefined;
}) {
  const t = useT();
  const students = data?.students ?? [];
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        title={t("reports.step.students")}
        bodyClassName="space-y-3"
        footer={
          <button
            type="button"
            onClick={onClose}
            disabled={cfg.students?.length === 0 || cfg.weekdays?.length === 0}
            className="w-full min-h-12 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
          >
            {t("reports.setup.done")}
          </button>
        }
      >
        <StudentPicker cfg={cfg} patch={patch} students={students} />
        <Filters cfg={cfg} patch={patch} schedule={data?.schedule ?? []} />
      </SheetContent>
    </Sheet>
  );
}

function StudentPicker({
  cfg,
  patch,
  students,
}: {
  cfg: ReportConfig;
  patch: Patch;
  students: ReportStudent[];
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const pool = students.filter((s) => !cfg.activeOnly || s.member);
  const manual = cfg.students !== null;
  const chosen = new Set(cfg.students ?? pool.map((s) => s.id));
  const nq = normalizeName(query);
  const shown = pool.filter((s) => !nq || normalizeName(s.name).includes(nq));
  const count = manual ? pool.filter((s) => chosen.has(s.id)).length : pool.length;
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    patch({ students: pool.filter((s) => next.has(s.id)).map((s) => s.id) });
  };
  return (
    <div className="space-y-3">
      <Choice
        cols={2}
        label={t("reports.students.mode")}
        value={manual ? "manual" : "all"}
        onChange={(v) => patch({ students: v === "all" ? null : pool.map((s) => s.id) })}
        options={[
          { value: "all", label: t("reports.students.all") },
          { value: "manual", label: t("reports.students.manual") },
        ]}
      />
      <Toggle
        label={t("reports.students.activeOnly")}
        hint={t("reports.students.activeOnlyHint")}
        checked={cfg.activeOnly}
        onChange={(activeOnly) => patch({ activeOnly })}
      />
      <p role="status" className="text-sm font-bold text-primary">
        {t("reports.students.selected", { n: fmtNum(count, "latn", 0) })}
      </p>
      {manual && (
        <div className="space-y-2">
          <label className="relative block">
            <span className="sr-only">{t("reports.students.search")}</span>
            <Search
              className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("reports.students.search")}
              className={`${inputCls} ps-9`}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => patch({ students: pool.map((s) => s.id) })}
              className="flex-1 min-h-11 rounded-2xl glass text-xs font-bold"
            >
              {t("reports.students.selectAll")}
            </button>
            <button
              type="button"
              onClick={() => patch({ students: [] })}
              className="flex-1 min-h-11 rounded-2xl glass text-xs font-bold"
            >
              {t("reports.students.selectNone")}
            </button>
          </div>
          <ul
            className="space-y-1.5 max-h-80 overflow-y-auto"
            aria-label={t("reports.students.list")}
          >
            {shown.map((s) => {
              const on = chosen.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(s.id)}
                    className="w-full min-h-11 rounded-2xl glass px-3 py-2 flex items-center gap-3 text-start"
                  >
                    <span
                      aria-hidden="true"
                      className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center ${
                        on ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}
                    >
                      {on && <Check className="w-3.5 h-3.5" />}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-bold text-foreground break-words">
                      {s.name}
                    </span>
                    {!s.member && (
                      <span className="text-xs text-muted-foreground">
                        {t("reports.students.left")}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {!count && (
            <p role="alert" className="text-xs font-bold text-destructive">
              {t("reports.students.none")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Filters({
  cfg,
  patch,
  schedule,
}: {
  cfg: ReportConfig;
  patch: Patch;
  schedule: ReportData["schedule"];
}) {
  const t = useT();
  const days = [...new Set(schedule.map((s) => s.weekday))].sort((a, b) => a - b);
  const chosen = cfg.weekdays ?? days;
  const toggleDay = (d: number) => {
    const next = chosen.includes(d) ? chosen.filter((x) => x !== d) : [...chosen, d].sort();
    patch({ weekdays: next.length === days.length ? null : next });
  };
  const gradeLabelOf = (g: GradeFilter) =>
    g === "all" ? t("reports.filterAll") : t(`reports.gradeFilter.${g}`);
  return (
    <div className="space-y-3 border-t border-border/60 pt-3">
      <Group label={t("reports.filter.status")}>
        <Choice
          label={t("reports.filter.status")}
          value={cfg.status}
          onChange={(status) => patch({ status })}
          options={STATUS.map((s) => ({
            value: s,
            label: s === "all" ? t("reports.filterAll") : t(`reports.status.${s}`),
          }))}
        />
      </Group>
      <Group label={t("reports.filter.grade")}>
        <Choice
          label={t("reports.filter.grade")}
          value={cfg.grade}
          onChange={(grade) => patch({ grade })}
          options={GRADES.map((g) => ({ value: g, label: gradeLabelOf(g) }))}
        />
      </Group>
      <Group label={t("reports.filter.achievement")}>
        <Choice
          cols={2}
          label={t("reports.filter.achievement")}
          value={cfg.achievement}
          onChange={(achievement) => patch({ achievement })}
          options={ACH.map((a) => ({
            value: a,
            label: a === "all" ? t("reports.filterAll") : t(`reports.achievementFilter.${a}`),
          }))}
        />
      </Group>
      {days.length > 0 && (
        <Group label={t("reports.filter.days")} hint={t("reports.periods.hint")}>
          <ul className="flex flex-wrap gap-1.5">
            {days.map((d) => {
              const on = chosen.includes(d);
              return (
                <li key={d}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggleDay(d)}
                    className={`min-h-11 rounded-full px-3.5 flex items-center gap-1.5 text-xs font-bold ${
                      on ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    {on && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                    {t(`reports.weekday.${d}`)}
                  </button>
                </li>
              );
            })}
          </ul>
          {chosen.length === 0 && (
            <p role="alert" className="text-xs font-bold text-destructive">
              {t("reports.periods.empty")}
            </p>
          )}
        </Group>
      )}
      <Group label={t("reports.sort.label")}>
        <Choice
          label={t("reports.sort.label")}
          value={cfg.sort}
          onChange={(sort) => patch({ sort })}
          options={SORTS.map((s) => ({ value: s, label: t(`reports.sort.${s}`) }))}
        />
      </Group>
    </div>
  );
}

function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-bold text-muted-foreground mb-1">{label}</legend>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}
