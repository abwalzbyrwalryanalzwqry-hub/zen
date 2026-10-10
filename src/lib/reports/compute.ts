/**
 * تجميع واحد لكل ما يحتاجه سجل الإنجاز والتقرير من البيانات: إحصاء كل طالب، والرحلة القرآنية، والمحطات،
 * والإجماليات، والمقارنة بالفترة السابقة، والتحقق. الشاشة والمعاينة وPDF وExcel تقرأ هذا الناتج نفسه.
 */
import {
  compareTotals,
  matchesGrade,
  matchesStatus,
  sortStats,
  studentStats,
  totalsOf,
  type Change,
  type StudentStats,
  type Totals,
} from "./calc";
import { journeyOf, periodMilestones, type Journey, type Milestone } from "./achieve";
import { sanitize, validateReport, type Issue } from "./validate";
import type { ReportConfig } from "./config";
import type { ReportData, ReportStudent } from "./types";

export interface StudentReport {
  stats: StudentStats;
  journey: Journey;
  milestones: Milestone[];
}

export interface Computed {
  data: ReportData;
  issues: Issue[];
  students: StudentReport[];
  totals: Totals;
  changes: Change[] | null;
}

type Filters = Pick<
  ReportConfig,
  "students" | "activeOnly" | "status" | "grade" | "achievement" | "sort"
>;

export const ALL_FILTERS: Filters = {
  students: null,
  activeOnly: false,
  status: "all",
  grade: "all",
  achievement: "all",
  sort: "circle",
};

function pickStudents(list: readonly ReportStudent[], f: Filters): ReportStudent[] {
  const chosen = f.students ? new Set(f.students) : null;
  return list.filter((s) => (!chosen || chosen.has(s.id)) && (!f.activeOnly || s.member));
}

export function compute(raw: ReportData, f: Filters, prevRaw?: ReportData | null): Computed {
  const issues = validateReport(raw);
  const data = sanitize(raw);
  const prev = prevRaw ? sanitize(prevRaw) : null;
  const prevBy = new Map<string, StudentStats>();
  if (prev) for (const s of prev.students) prevBy.set(s.id, studentStats(prev, s));
  const history = new Map<string, ReportData["history"]>();
  for (const h of data.history) {
    const l = history.get(h.student_id);
    if (l) l.push(h);
    else history.set(h.student_id, [h]);
  }
  const base = pickStudents(data.students, f).map((s) => {
    const p = prevBy.get(s.id) ?? null;
    const stats = studentStats(data, s, p);
    const journey = journeyOf(history.get(s.id) ?? []);
    return { stats, journey, milestones: periodMilestones(journey, stats, data.from, data.to, p) };
  });
  const allTotals = totalsOf(
    base.map((b) => b.stats),
    data.days.length,
  );
  const kept = base.filter((b) => {
    if (!matchesStatus(b.stats, f.status, allTotals)) return false;
    if (!matchesGrade(b.stats, f.grade)) return false;
    if (f.achievement === "hasAchievements") return b.milestones.length > 0;
    if (f.achievement === "noProgress") return b.stats.memorize.sessions === 0;
    if (f.achievement === "stalled")
      return b.stats.memorize.sessions === 0 && b.journey.coverage.ayahs > 0;
    return true;
  });
  const order = sortStats(
    kept.map((k) => k.stats),
    f.sort,
  );
  const byId = new Map(kept.map((k) => [k.stats.student.id, k]));
  const students = order.map((s) => byId.get(s.student.id)!);
  const totals = totalsOf(
    students.map((s) => s.stats),
    data.days.length,
  );
  const changes = prev
    ? compareTotals(
        totals,
        totalsOf(
          students.map((s) => prevBy.get(s.stats.student.id)).filter((x): x is StudentStats => !!x),
          prev.days.length,
        ),
      )
    : null;
  return { data, issues, students, totals, changes };
}
