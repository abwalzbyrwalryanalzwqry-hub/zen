/**
 * أقسام مستند التقرير وجداوله (يستعملها buildDoc في doc.ts). كل رقم من compute، وكل نص من t().
 */
import { t } from "@/lib/i18n";
import { gradeKeyOf5, gradeLabel } from "@/lib/grading";
import { EVAL_CRITERIA } from "@/lib/daily-record";
import { SURAHS } from "@/lib/quran-meta";
import { fmtDate, fmtNum, fmtPct, fmtShortDate, type NumberStyle } from "./format";
import { evaluationAverages, workLines, type Change, type FollowUpReason } from "./calc";
import type { Milestone } from "./achieve";
import type { Computed, StudentReport } from "./compute";
import type { RecordType, ReportConfig } from "./config";
import type { WorkLine } from "./types";
import type { Block, Cell, Column, SummaryItem, TableBlock } from "./doc";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

export const has = (c: ReportConfig, r: RecordType) => c.records.includes(r);

export function gradeText(g: number | null, style: NumberStyle): string {
  if (g == null) return "—";
  return `${gradeLabel(gradeKeyOf5(g))} — ${fmtNum(g, style.digits, 1)}`;
}

/** «النبإ ١» */
const point = (surah: string, ayah: number, s: NumberStyle) =>
  `${surah}\u00a0${fmtNum(ayah, s.digits, 0)}`;

function lineRange(l: WorkLine, s: NumberStyle): { from: string; to: string } {
  const first = l.segments[0];
  const last = l.segments[l.segments.length - 1];
  return {
    from: first ? point(first.surah_name, first.from_ayah, s) : "—",
    to: last ? point(last.surah_name, last.to_ayah, s) : "—",
  };
}

export function followUpText(r: FollowUpReason, s: NumberStyle): string {
  const n = (x: number, d = 0) => fmtNum(x, s.digits, d);
  switch (r.kind) {
    case "absences":
      return t("reports.follow.absences", { n: n(r.n) });
    case "lowAttendance":
      return t("reports.follow.lowAttendance", { pct: fmtPct(r.pct, s.digits) });
    case "lowGrade":
      return t("reports.follow.lowGrade", { avg: n(r.avg, 1) });
    case "noMemorize":
      return t("reports.follow.noMemorize", { n: n(r.days) });
    case "noReview":
      return t("reports.follow.noReview", { n: n(r.days) });
    case "decline":
      return t("reports.follow.decline", { from: n(r.from, 1), to: n(r.to, 1) });
  }
}

export function milestoneText(m: Milestone, s: NumberStyle): string {
  const n = (x: number, d = 0) => fmtNum(x, s.digits, d);
  switch (m.kind) {
    case "surah":
      return t("reports.milestone.surah", { surah: SURAHS[m.surah - 1]?.name ?? "" });
    case "juz":
      return t("reports.milestone.juz", { n: n(m.juz) });
    case "juzCount":
      return t("reports.milestone.juzCount", { n: n(m.count) });
    case "half":
      return t("reports.milestone.half");
    case "khatm":
      return t("reports.milestone.khatm");
    case "regular":
      return t("reports.milestone.regular", { pct: fmtPct(m.pct, s.digits) });
    case "improved":
      return t("reports.milestone.improved", { from: n(m.from, 1), to: n(m.to, 1) });
  }
}

const statusText = (st: string | null) => (st ? t(`dailyRecord.attendance.${st}`) : "—");

/* ─────────── الأقسام ─────────── */

export function summaryBlock(c: Computed, cfg: ReportConfig, s: NumberStyle): Block {
  const T = c.totals;
  const d = s.digits;
  const items: SummaryItem[] = [
    { label: t("reports.sum.students"), value: fmtNum(T.students, d, 0) },
    { label: t("reports.sum.days"), value: fmtNum(T.days, d, 0) },
  ];
  const ch = new Map((cfg.compare ? (c.changes ?? []) : []).map((x) => [x.metric, x]));
  const delta = (m: Change["metric"], pct = false): SummaryItem["delta"] => {
    const x = ch.get(m);
    if (!x?.dir || x.prev == null) return undefined;
    const prev = pct ? fmtPct(x.prev, d) : fmtNum(x.prev, d, m === "avgGrade" ? 1 : undefined);
    const arrow = x.dir === "up" ? "▲" : x.dir === "down" ? "▼" : "=";
    return { dir: x.dir, text: t("reports.sum.delta", { arrow, prev }) };
  };
  if (has(cfg, "attendance"))
    items.push(
      { label: t("reports.sum.present"), value: fmtNum(T.present + T.late, d, 0) },
      { label: t("reports.sum.absent"), value: fmtNum(T.absent, d, 0) },
      { label: t("reports.sum.excused"), value: fmtNum(T.excused, d, 0) },
      { label: t("reports.sum.rate"), value: fmtPct(T.rate, d), delta: delta("rate", true) },
    );
  if (has(cfg, "memorize"))
    items.push({
      label: t("reports.sum.memorizePages"),
      value: fmtNum(T.memorizePages, d),
      delta: delta("memorizePages"),
    });
  if (has(cfg, "review"))
    items.push({
      label: t("reports.sum.reviewPages"),
      value: fmtNum(T.reviewPages, d),
      delta: delta("reviewPages"),
    });
  if (has(cfg, "memorize") || has(cfg, "review") || has(cfg, "evaluation"))
    items.push({
      label: t("reports.sum.avgGrade"),
      value: fmtNum(T.avgGrade, d, 1),
      delta: delta("avgGrade"),
    });
  // 1.21.1: الأيام التي عُدّلت بعد إغلاقها (أثر التدقيق) — شفافية للإدارة ووليّ الأمر، لا حكم.
  const edited = c.data.days.filter((x) => (x.edits_after_close ?? 0) > 0).length;
  if (edited > 0) items.push({ label: t("reports.sum.editedDays"), value: fmtNum(edited, d, 0) });
  const note = items.some((i) => i.delta) ? t("reports.sum.compareNote") : undefined;
  return { type: "summary", items, note };
}

export function attendanceTable(list: StudentReport[], s: NumberStyle): TableBlock {
  const d = s.digits;
  const late = list.some((x) => x.stats.attendance.late > 0);
  const cols: Column[] = [
    { label: t("reports.col.name"), w: late ? 30 : 34 },
    { label: t("reports.col.present"), w: 12, num: true },
    ...(late ? [{ label: t("reports.col.late"), w: 11, num: true }] : []),
    { label: t("reports.col.excused"), w: 12, num: true },
    { label: t("reports.col.absent"), w: 12, num: true },
    { label: t("reports.col.total"), w: 11, num: true },
    { label: t("reports.col.rate"), w: late ? 12 : 19, num: true },
  ];
  const groups = list.map(({ stats: st }) => {
    const a = st.attendance;
    return [
      [
        { text: st.student.name, strong: true, flag: st.followUp.length > 0 },
        { text: fmtNum(a.present, d, 0), num: true },
        ...(late ? [{ text: fmtNum(a.late, d, 0), num: true }] : []),
        { text: fmtNum(a.excused, d, 0), num: true },
        { text: fmtNum(a.absent, d, 0), num: true },
        { text: fmtNum(a.marked, d, 0), num: true },
        { text: fmtPct(a.rate, d), num: true, strong: true },
      ],
    ];
  });
  return { type: "table", columns: cols, groups, empty: t("reports.empty.table") };
}

/** الحفظ والمراجعة مجمّعين لكل طالب: من أول نقطة إلى آخر نقطة في الفترة، ومجموع الصفحات، ومتوسط التقدير. */
export function workSummaryTable(
  list: StudentReport[],
  cfg: ReportConfig,
  s: NumberStyle,
): TableBlock {
  const kinds = (["memorize", "review"] as const).filter((k) => has(cfg, k));
  const cols: Column[] = [
    { label: t("reports.col.name"), w: 24 },
    { label: t("reports.col.kind"), w: 11 },
    { label: t("reports.col.from"), w: 17 },
    { label: t("reports.col.to"), w: 17 },
    { label: t("reports.col.pages"), w: 11, num: true },
    { label: t("reports.col.grade"), w: 20 },
  ];
  const groups = list.map(({ stats: st }) =>
    kinds.map((k) => {
      const w = st[k];
      const from = w.first?.segments[0];
      const lastSeg = w.last?.segments[w.last.segments.length - 1];
      return [
        { text: st.student.name, strong: true, span: true, flag: st.followUp.length > 0 },
        { text: t(`reports.kind.${k}`) },
        { text: from ? point(from.surah_name, from.from_ayah, s) : "—" },
        { text: lastSeg ? point(lastSeg.surah_name, lastSeg.to_ayah, s) : "—" },
        { text: w.sessions ? fmtNum(w.pages, s.digits) : "—", num: true },
        { text: gradeText(w.avgGrade, s) },
      ];
    }),
  );
  return { type: "table", columns: cols, groups, empty: t("reports.empty.table") };
}

/** سجل الجلسات التفصيلي: سطر لكل يوم حفظ أو مراجعة، مجمّعاً تحت اسم الطالب. */
export function workLogTable(
  list: StudentReport[],
  c: Computed,
  cfg: ReportConfig,
  s: NumberStyle,
  withName = true,
): TableBlock {
  const kinds = (["memorize", "review"] as const).filter((k) => has(cfg, k));
  const cols: Column[] = [
    ...(withName ? [{ label: t("reports.col.name"), w: 20 }] : []),
    { label: t("reports.col.date"), w: withName ? 13 : 16 },
    { label: t("reports.col.kind"), w: withName ? 10 : 12 },
    { label: t("reports.col.from"), w: withName ? 16 : 19 },
    { label: t("reports.col.to"), w: withName ? 16 : 19 },
    { label: t("reports.col.pages"), w: withName ? 9 : 10, num: true },
    { label: t("reports.col.grade"), w: withName ? 16 : 24 },
  ];
  const groups: Cell[][][] = [];
  for (const { stats: st } of list) {
    const lines = workLines(
      c.data.rows.filter((r) => r.student_id === st.student.id),
      kinds,
    );
    if (!lines.length) continue;
    groups.push(
      lines.map((l) => {
        const r = lineRange(l, s);
        return [
          ...(withName
            ? [{ text: st.student.name, strong: true, span: true, flag: st.followUp.length > 0 }]
            : []),
          { text: fmtShortDate(l.date, s), num: true },
          { text: t(`reports.kind.${l.kind}`) },
          { text: r.from },
          { text: r.to },
          { text: fmtNum(l.pages, s.digits), num: true },
          { text: gradeText(l.grade, s) },
        ];
      }),
    );
  }
  return { type: "table", columns: cols, groups, empty: t("reports.empty.work") };
}

export function evaluationTable(list: StudentReport[], c: Computed, s: NumberStyle): TableBlock {
  const cols: Column[] = [
    { label: t("reports.col.name"), w: 28 },
    ...EVAL_CRITERIA.map((k) => ({ label: t(`dailyRecord.eval.${k}`), w: 18, num: true })),
  ];
  const groups = list
    .map(({ stats: st }): Cell[][] | null => {
      const avgs = evaluationAverages(c.data.rows.filter((r) => r.student_id === st.student.id));
      if (EVAL_CRITERIA.every((k) => avgs[k] == null)) return null;
      return [
        [
          { text: st.student.name, strong: true, flag: st.followUp.length > 0 },
          ...EVAL_CRITERIA.map((k) => ({ text: fmtNum(avgs[k], s.digits, 1), num: true })),
        ],
      ];
    })
    .filter((g): g is Cell[][] => !!g);
  return { type: "table", columns: cols, groups, empty: t("reports.empty.evaluation") };
}

export function achievementTable(list: StudentReport[], s: NumberStyle): TableBlock {
  const d = s.digits;
  const cols: Column[] = [
    { label: t("reports.col.name"), w: 22 },
    { label: t("reports.col.lastPoint"), w: 17 },
    { label: t("reports.col.juz"), w: 10, num: true },
    { label: t("reports.col.surahs"), w: 10, num: true },
    { label: t("reports.col.progress"), w: 11, num: true },
    { label: t("reports.col.milestones"), w: 30 },
  ];
  const groups = list.map(({ stats: st, journey: j, milestones }) => [
    [
      { text: st.student.name, strong: true, flag: st.followUp.length > 0 },
      { text: j.last ? point(j.last.surah_name, j.last.to_ayah, s) : "—" },
      { text: fmtNum(j.completedJuz.length, d, 0), num: true },
      { text: fmtNum(j.completedSurahs, d, 0), num: true },
      { text: fmtPct(j.pct, d), num: true },
      {
        text: milestones.length ? milestones.map((m) => milestoneText(m, s)).join("، ") : "—",
        muted: !milestones.length,
      },
    ],
  ]);
  return { type: "table", columns: cols, groups, empty: t("reports.empty.table") };
}

export function followUpTable(list: StudentReport[], s: NumberStyle): TableBlock {
  const cols: Column[] = [
    { label: t("reports.col.name"), w: 30 },
    { label: t("reports.col.reason"), w: 70 },
  ];
  const groups = list
    .filter((x) => x.stats.followUp.length)
    .map(({ stats: st }) => [
      [
        { text: st.student.name, strong: true, flag: st.followUp.length > 0 },
        { text: st.followUp.map((r) => followUpText(r, s)).join("؛ ") },
      ],
    ]);
  return { type: "table", columns: cols, groups, empty: t("reports.empty.followUp") };
}

export function notesTable(list: StudentReport[], s: NumberStyle, withName = true): TableBlock {
  const cols: Column[] = [
    ...(withName ? [{ label: t("reports.col.name"), w: 24 }] : []),
    { label: t("reports.col.date"), w: withName ? 16 : 20 },
    { label: t("reports.col.note"), w: withName ? 60 : 80 },
  ];
  const groups: Cell[][][] = [];
  for (const { stats: st } of list)
    if (st.notes.length)
      groups.push(
        st.notes.map((n) => [
          ...(withName
            ? [{ text: st.student.name, strong: true, span: true, flag: st.followUp.length > 0 }]
            : []),
          { text: fmtShortDate(n.date, s), num: true },
          { text: n.text },
        ]),
      );
  return { type: "table", columns: cols, groups, empty: t("reports.empty.notes") };
}

/** التقرير اليومي: سطر لكل طالب في كل يوم (الحالة والحفظ والمراجعة والتقدير والملاحظة). */
export function dailyBlocks(list: StudentReport[], c: Computed, s: NumberStyle): Block[] {
  const out: Block[] = [];
  const ids = new Set(list.map((x) => x.stats.student.id));
  const names = new Map(list.map((x) => [x.stats.student.id, x.stats.student.name]));
  const order = new Map(list.map((x, i) => [x.stats.student.id, i]));
  const dates = [...new Set(c.data.rows.map((r) => r.date))].sort();
  const cols: Column[] = [
    { label: t("reports.col.name"), w: 20 },
    { label: t("reports.col.status"), w: 11 },
    { label: t("reports.kind.memorize"), w: 22 },
    { label: t("reports.kind.review"), w: 22 },
    { label: t("reports.col.grade"), w: 10, num: true },
    { label: t("reports.col.note"), w: 15 },
  ];
  const range = (w: WorkLine | null) => {
    if (!w) return "—";
    const r = lineRange(w, s);
    return `${r.from} – ${r.to}`;
  };
  for (const d of dates) {
    const rows = c.data.rows
      .filter((r) => r.date === d && ids.has(r.student_id))
      .sort((a, b) => (order.get(a.student_id) ?? 0) - (order.get(b.student_id) ?? 0));
    if (!rows.length) continue;
    out.push({ type: "heading", text: fmtDate(d, s) });
    out.push({
      type: "table",
      columns: cols,
      empty: t("reports.empty.table"),
      groups: rows.map((r) => {
        const m = workLines([r], ["memorize"])[0] ?? null;
        const v = workLines([r], ["review"])[0] ?? null;
        const g = [m?.grade, v?.grade].filter((x): x is number => x != null);
        return [
          [
            { text: names.get(r.student_id) ?? "", strong: true },
            { text: statusText(r.status) },
            { text: range(m) },
            { text: range(v) },
            { text: g.length ? fmtNum(Math.max(...g), s.digits, 0) : "—", num: true },
            { text: r.note?.trim() || "—", muted: !r.note },
          ],
        ];
      }),
    });
  }
  return out;
}

export function studentBlocks(
  x: StudentReport,
  c: Computed,
  cfg: ReportConfig,
  s: NumberStyle,
): Block[] {
  const st = x.stats;
  const d = s.digits;
  const out: Block[] = [];
  const h = c.data.halaqa;
  out.push({
    type: "student",
    name: st.student.name,
    lines: [
      { label: t("reports.meta.halaqa"), value: h.name },
      { label: t("reports.meta.teacher"), value: h.teacher_name ?? "—" },
      { label: t("reports.sum.rate"), value: fmtPct(st.attendance.rate, d) },
      { label: t("reports.sum.memorizePages"), value: fmtNum(st.memorize.pages, d) },
      { label: t("reports.sum.reviewPages"), value: fmtNum(st.review.pages, d) },
      { label: t("reports.sum.avgGrade"), value: gradeText(st.avgGrade, s) },
    ],
  });
  const brief = parentSummary(x, s);
  if (brief) out.push({ type: "para", tone: "note", text: brief });
  if (has(cfg, "attendance")) {
    out.push({ type: "heading", text: t("reports.section.attendance") });
    out.push(attendanceTable([x], s));
  }
  if (has(cfg, "memorize") || has(cfg, "review")) {
    out.push({ type: "heading", text: t("reports.section.work") });
    out.push(workLogTable([x], c, cfg, s, false));
  }
  if (has(cfg, "evaluation")) {
    out.push({ type: "heading", text: t("reports.section.evaluation") });
    out.push(evaluationTable([x], c, s));
  }
  if (has(cfg, "achievement")) {
    out.push({ type: "heading", text: t("reports.section.achievement") });
    out.push(achievementTable([x], s));
    const timeline = x.journey.milestones.slice(-8).reverse();
    if (timeline.length) {
      out.push({ type: "heading", text: t("reports.section.timeline") });
      out.push({
        type: "table",
        columns: [
          { label: t("reports.col.date"), w: 25 },
          { label: t("reports.col.milestone"), w: 75 },
        ],
        groups: timeline.map((m) => [
          [
            { text: fmtDate(m.date, s), num: true },
            { text: milestoneText(m, s), strong: true },
          ],
        ]),
        empty: "",
      });
    }
  }
  if (has(cfg, "notes")) {
    out.push({ type: "heading", text: t("reports.section.notes") });
    out.push(notesTable([x], s, false));
  }
  const perf: string[] = [];
  if (st.trend) perf.push(t(`reports.trend.${st.trend}`));
  if (st.followUp.length)
    perf.push(
      `${t("reports.follow.title")}: ${st.followUp.map((r) => followUpText(r, s)).join("؛ ")}`,
    );
  else if (st.attendance.marked) perf.push(t("reports.follow.none"));
  if (perf.length) {
    out.push({ type: "heading", text: t("reports.section.performance") });
    out.push({ type: "para", text: perf.join("، "), tone: st.followUp.length ? "warn" : "note" });
  }
  return out;
}

/**
 * فقرة قصيرة لولي الأمر بلغة عادية: الحضور ثم الحفظ والمراجعة ثم التقدير. لا جملة لما لا بيانات له.
 */
export function parentSummary(x: StudentReport, s: NumberStyle): string {
  const st = x.stats;
  const d = s.digits;
  const parts: string[] = [];
  const a = st.attendance;
  if (a.marked)
    parts.push(
      t("reports.parent.attendance", {
        n: fmtNum(a.present + a.late, d, 0),
        of: fmtNum(a.marked, d, 0),
        rate: fmtPct(a.rate, d),
      }),
    );
  if (st.memorize.pages || st.review.pages)
    parts.push(
      t("reports.parent.work", {
        m: fmtNum(st.memorize.pages, d),
        r: fmtNum(st.review.pages, d),
      }),
    );
  if (!parts.length) return "";
  const grade =
    st.avgGrade != null ? ` ${t("reports.parent.grade", { g: gradeText(st.avgGrade, s) })}` : "";
  return `${t("reports.parent.lead", { name: st.student.name })} ${parts.join("، ")}${grade}.`;
}

/** خانات التوقيع: المعلّم وولي الأمر لتقرير الطالب، والمعلّم وختم المركز لغيره. */
export function signBlock(kind: "student" | "halaqa"): Block {
  return {
    type: "sign",
    labels:
      kind === "student"
        ? [t("reports.sign.teacher"), t("reports.sign.guardian")]
        : [t("reports.sign.teacher"), t("reports.sign.stamp")],
  };
}
