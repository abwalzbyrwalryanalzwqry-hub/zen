import { ensureReportsDict } from "@/lib/reports/i18n";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CloudOff, FileSearch } from "lucide-react";
import { EmptyState } from "@/components/zen/common/EmptyState";
import { intlLocale, useT } from "@/lib/i18n";
import { useReportBuild } from "@/hooks/use-report-build";
import { fetchReportData, reportKey } from "@/lib/reports/api";
import { previousRange } from "@/lib/reports/calc";
import { compute } from "@/lib/reports/compute";
import {
  KIND_RECORDS,
  loadConfig,
  rangeError,
  saveConfig,
  type ReportConfig,
} from "@/lib/reports/config";
import { ReportSetup } from "./ReportSetup";
import { CustomizeSheets, type CustomizeOpen } from "./ReportCustomize";
import { useServerIdentity } from "./use-server-identity";
import { ReportShortcuts } from "./ReportShortcuts";
import { markLast } from "@/lib/reports/favorites";
import { BuildError, BuildProgress, ReportPreview } from "./ReportPreview";
import type { Patch } from "./ReportSteps";

void ensureReportsDict();

export type View = "setup" | "preview";

function initial(halaqa: string, today: string, student?: string): ReportConfig {
  const c = loadConfig(halaqa, today, "");
  return student
    ? { ...c, kind: "student", students: [student], records: [...KIND_RECORDS.student] }
    : c;
}

/**
 * «إعداد التقرير» (1.15.0): شاشة واحدة للاختيار ثم المعاينة، بدل عشر خطوات. الإعدادات تُحفظ على الجهاز لكل
 * حلقة، والمعاينة والتصدير من مستند واحد. لا حساب هنا: الأرقام من compute والنص من buildDoc.
 */
export function ReportWizard({
  halaqa,
  today,
  student,
}: {
  halaqa: string;
  today: string;
  student?: string;
}) {
  const t = useT();
  const [cfg, setCfg] = useState(() => initial(halaqa, today, student));
  // من سجل الإنجاز («تقرير الطالب»): المعاينة مباشرة، فالإعداد معروف.
  const [view, setView] = useState<View>(student ? "preview" : "setup");
  const [custom, setCustom] = useState<CustomizeOpen>(null);
  useEffect(() => saveConfig(halaqa, cfg), [halaqa, cfg]);
  const { canEdit } = useServerIdentity(halaqa, cfg, setCfg);
  useEffect(() => {
    document.querySelector("[data-report-top]")?.scrollIntoView({ block: "start" });
  }, [view]);
  const set = (c: ReportConfig) => setCfg(c);
  const patch: Patch = (p) => setCfg((c) => ({ ...c, ...p }));

  const okRange = !rangeError(cfg);
  const baseQ = { halaqa, from: cfg.from, to: cfg.to };
  const base = useQuery({
    queryKey: reportKey(baseQ),
    enabled: okRange,
    queryFn: () => fetchReportData(baseQ),
  });
  const needHistory =
    cfg.records.includes("achievement") || cfg.kind === "student" || cfg.kind === "achievement";
  const fullQ = {
    halaqa,
    from: cfg.from,
    to: cfg.to,
    students: cfg.students,
    weekdays: cfg.weekdays,
    history: needHistory,
  };
  const late = view !== "setup";
  const full = useQuery({
    queryKey: reportKey(fullQ),
    enabled: okRange && late,
    queryFn: () => fetchReportData(fullQ),
  });
  const prevR = previousRange(cfg.from, cfg.to);
  const prevQ = { halaqa, ...prevR, students: cfg.students, weekdays: cfg.weekdays };
  const prev = useQuery({
    queryKey: reportKey(prevQ),
    enabled: okRange && late && cfg.compare,
    queryFn: () => fetchReportData(prevQ),
  });
  const prevData = cfg.compare ? prev.data : null;
  const filters = {
    students: cfg.students,
    activeOnly: cfg.activeOnly,
    status: cfg.status,
    grade: cfg.grade,
    achievement: cfg.achievement,
    sort: cfg.sort,
  };
  const fkey = JSON.stringify(filters);
  const computed = useMemo(
    () => (full.data ? compute(full.data, JSON.parse(fkey), prevData) : null),
    [full.data, prevData, fkey],
  );
  const waitingPrev = cfg.compare && prev.isPending && !prev.isError;
  const build = useReportBuild(late && !waitingPrev ? computed : null, cfg, custom ? 400 : 0);

  const retry = () => {
    void base.refetch();
    void full.refetch();
    if (cfg.compare) void prev.refetch();
    setCfg((c) => ({ ...c }));
  };
  const failed = full.isError || base.isError || !!build.error;
  const toSetup = () => setView("setup");
  const empty = !!build.doc?.empty && !!computed;

  // دون اتصال (1.16.0): التقرير من بيانات الجهاز، مع وقتها، وتنبيه إن كان جزئياً.
  const offline = (late ? full.data : base.data) ?? null;
  const offlineAt = offline?.offline_at;

  return (
    <div className="space-y-3" data-report-top="">
      {offlineAt && (
        <p
          role="status"
          className="rounded-2xl bg-muted/70 px-3 py-2 text-xs font-bold text-foreground flex items-center gap-1.5"
        >
          <CloudOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {t(offline?.offline_partial ? "reports.offline.partial" : "reports.offline.cached", {
            time: new Intl.DateTimeFormat(intlLocale(), {
              hour: "numeric",
              minute: "2-digit",
              day: "numeric",
              month: "short",
            }).format(new Date(offlineAt)),
          })}
        </p>
      )}
      {view === "setup" ? (
        <ReportSetup
          cfg={cfg}
          patch={patch}
          today={today}
          data={base.data}
          onPreview={() => setView("preview")}
          shortcuts={
            <ReportShortcuts
              halaqa={halaqa}
              cfg={cfg}
              today={today}
              onApply={(c) => {
                setCfg(c);
                setView("preview");
              }}
            />
          }
        />
      ) : failed ? (
        <BuildError onRetry={retry} onBack={toSetup} />
      ) : !computed || full.isPending ? (
        <BuildProgress stage="attendance" />
      ) : empty ? (
        <EmptyState
          icon={FileSearch}
          title={t("reports.empty.title")}
          hint={t("reports.empty.hint")}
          action={
            <button
              type="button"
              onClick={toSetup}
              className="min-h-11 px-4 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold"
            >
              {t("reports.empty.action")}
            </button>
          }
        />
      ) : (
        <ReportPreview
          computed={computed}
          cfg={cfg}
          build={build}
          onEdit={() => setCustom("customize")}
          onSetup={toSetup}
          onExported={() => markLast(halaqa, cfg)}
        />
      )}
      <CustomizeSheets open={custom} setOpen={setCustom} cfg={cfg} set={set} canEdit={canEdit} />
    </div>
  );
}
