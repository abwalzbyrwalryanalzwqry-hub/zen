import { ensureReportsDict } from "@/lib/reports/i18n";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, FileBarChart, Loader2, Medal, Search, Trophy } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { EmptyState } from "@/components/zen/common/EmptyState";
import { QueryError } from "@/components/zen/QueryError";
import { useT } from "@/lib/i18n";
import { normalizeName } from "@/lib/daily-record";
import { fetchReportData, reportKey } from "@/lib/reports/api";
import { previousRange } from "@/lib/reports/calc";
import { ALL_FILTERS, compute } from "@/lib/reports/compute";
import { presetRange, type RangePreset } from "@/lib/reports/config";
import { fmtNum, fmtPct } from "@/lib/reports/format";
import { Choice, inputCls, Stat, Stats } from "./parts";
import { StudentAchievement } from "./StudentAchievement";

void ensureReportsDict();

const PRESETS: RangePreset[] = ["month", "last30", "last90"];

/**
 * سجل الإنجاز داخل «السجل اليومي»: لا إدخال فيه. يقرأ أيام السجل اليومي نفسها (halaqa_report_data) ويفسّرها
 * بمحرّكي الحساب والإنجاز اللذين تستعملهما التقارير، فما يظهر هنا هو ما يظهر في PDF وExcel.
 */
export function AchievementLog({ halaqa, today }: { halaqa: string; today: string }) {
  const t = useT();
  const [preset, setPreset] = useState<RangePreset>("month");
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const range = presetRange(preset, today)!;
  const prevR = previousRange(range.from, range.to);
  const q = { halaqa, ...range, history: true };
  const pq = { halaqa, ...prevR };
  const cur = useQuery({
    queryKey: reportKey(q),
    enabled: !!halaqa,
    queryFn: () => fetchReportData(q),
  });
  const prev = useQuery({
    queryKey: reportKey(pq),
    enabled: !!halaqa && cur.isSuccess,
    queryFn: () => fetchReportData(pq),
  });
  const computed = useMemo(
    () => (cur.data ? compute(cur.data, { ...ALL_FILTERS, activeOnly: true }, prev.data) : null),
    [cur.data, prev.data],
  );

  if (cur.isPending)
    return (
      <div className="flex justify-center py-10" role="status" aria-label={t("common.loading")}>
        <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  if (cur.isError || !computed) return <QueryError onRetry={() => void cur.refetch()} />;

  const one = picked ? computed.students.find((s) => s.stats.student.id === picked) : null;
  // ملخص الطالب في نصف شاشة فوق القائمة (1.14.0) بدل استبدالها: الرجوع لا يضيّع البحث ولا موضع التمرير.
  const sheet = (
    <Sheet open={!!one} onOpenChange={(o) => !o && setPicked(null)}>
      <SheetContent
        title={one?.stats.student.name ?? ""}
        footer={
          one ? (
            <div className="w-full grid grid-cols-2 gap-2">
              <Link
                to="/teacher/reports"
                search={{ halaqa, student: one.stats.student.id }}
                className="min-h-12 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-1.5"
              >
                <FileBarChart className="w-4 h-4" aria-hidden="true" />
                {t("reports.ach.studentReport")}
              </Link>
              {/* استوديو الشهائد: النوع يُقترح من آخر محطة في هذا السجل نفسه. */}
              <Link
                to="/certificates/new"
                search={{ halaqa, student: one.stats.student.id }}
                className="min-h-12 rounded-2xl bg-gold/15 border border-gold/40 text-foreground text-sm font-bold flex items-center justify-center gap-1.5"
              >
                <Medal className="w-4 h-4" aria-hidden="true" />
                {t("reports.ach.issueCertificate")}
              </Link>
            </div>
          ) : undefined
        }
      >
        {one && <StudentAchievement r={one} data={computed.data} />}
      </SheetContent>
    </Sheet>
  );

  const T = computed.totals;
  const nq = normalizeName(query);
  const list = computed.students.filter(
    (s) => !nq || normalizeName(s.stats.student.name).includes(nq),
  );
  return (
    <div className="space-y-3">
      {sheet}
      <Choice
        label={t("reports.range.label")}
        value={preset}
        onChange={setPreset}
        options={PRESETS.map((p) => ({ value: p, label: t(`reports.range.${p}`) }))}
      />
      <section
        className="glass rounded-3xl p-3.5 space-y-2.5"
        aria-label={t("reports.ach.halaqaSummary")}
      >
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-sm font-black text-foreground">
            {t("reports.ach.halaqaSummary")}
          </h3>
          <Link
            to="/teacher/reports"
            search={{ halaqa }}
            className="min-h-11 px-3 rounded-2xl bg-primary/10 text-primary text-xs font-bold flex items-center gap-1.5"
          >
            <FileBarChart className="w-4 h-4" aria-hidden="true" />
            {t("reports.title")}
          </Link>
          <Link
            to="/certificates"
            search={{ halaqa }}
            className="min-h-11 px-3 rounded-2xl bg-gold/15 text-foreground text-xs font-bold flex items-center gap-1.5"
          >
            <Medal className="w-4 h-4" aria-hidden="true" />
            {t("reports.ach.halaqaCertificates")}
          </Link>
        </div>
        <Stats cols={4}>
          <Stat label={t("reports.sum.rate")} value={fmtPct(T.rate, "latn")} />
          <Stat label={t("reports.sum.memorizePages")} value={fmtNum(T.memorizePages, "latn")} />
          <Stat label={t("reports.sum.reviewPages")} value={fmtNum(T.reviewPages, "latn")} />
          <Stat
            label={t("reports.sum.followUp")}
            value={fmtNum(T.followUp, "latn", 0)}
            tone={T.followUp ? "warn" : undefined}
          />
        </Stats>
        {computed.changes?.some((c) => c.dir) && (
          <p className="text-xs text-muted-foreground">
            {t("reports.sum.compare")}:{" "}
            {computed.changes
              .filter((c) => c.dir)
              .map((c) => `${t(`reports.metric.${c.metric}`)} ${t(`reports.dir.${c.dir}`)}`)
              .join(" · ")}
          </p>
        )}
      </section>
      {computed.students.length > 6 && (
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
      )}
      {!list.length ? (
        <EmptyState
          icon={Trophy}
          title={t("reports.ach.empty")}
          hint={t("reports.ach.emptyHint")}
        />
      ) : (
        <ul className="space-y-2" aria-label={t("reports.ach.students")}>
          {list.map(({ stats: s, journey: j }) => (
            <li key={s.student.id}>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setPicked(s.student.id)}
                className="w-full glass rounded-3xl p-3.5 text-start space-y-2"
              >
                <span className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-sm font-black text-foreground break-words">
                    {s.student.name}
                  </span>
                  {s.followUp.length > 0 && (
                    <span className="shrink-0 rounded-full bg-gold/15 text-gold-ink px-2 py-0.5 text-xs font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                      {t("reports.follow.badge")}
                    </span>
                  )}
                </span>
                <span className="grid grid-cols-4 gap-1.5 text-center">
                  {(
                    [
                      [t("reports.col.rate"), fmtPct(s.attendance.rate, "latn")],
                      [t("reports.col.pages"), fmtNum(s.memorize.pages, "latn")],
                      [t("reports.ach.avg"), fmtNum(s.avgGrade, "latn")],
                      [t("reports.ach.quran"), fmtPct(j.pct, "latn")],
                    ] as const
                  ).map(([l, v]) => (
                    <span key={l} className="rounded-2xl bg-muted/50 px-1 py-1.5">
                      <span className="block text-xs text-muted-foreground">{l}</span>
                      <span className="block text-sm font-black text-foreground tabular-nums">
                        {v}
                      </span>
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
