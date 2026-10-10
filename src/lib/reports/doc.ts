/**
 * نموذج مستند التقرير: أقسام وجداول بلا تنسيق (المحرّك يرسمها HTML للمعاينة والطباعة، ويحوّلها Excel/CSV).
 * كل رقم من compute.ts، وكل تنسيق من format.ts، وكل نص من t() (قاموس التقارير).
 */
import { t } from "@/lib/i18n";
import { gradeKeyOf5, gradeLabel } from "@/lib/grading";
import { fmtDate, fmtNum, type NumberStyle } from "./format";
import type { Computed } from "./compute";
import { reportFileName, type ReportConfig } from "./config";
import {
  achievementTable,
  attendanceTable,
  dailyBlocks,
  evaluationTable,
  followUpTable,
  has,
  signBlock,
  notesTable,
  studentBlocks,
  summaryBlock,
  workLogTable,
  workSummaryTable,
} from "./sections";

export interface Cell {
  text: string;
  num?: boolean;
  strong?: boolean;
  muted?: boolean;
  /** يُدمج عمودياً عبر صفوف المجموعة (اسم الطالب). */
  span?: boolean;
  /** علامة «يحتاج متابعة» بجانب الاسم. */
  flag?: boolean;
}
export interface Column {
  label: string;
  /** عرض نسبي (مجموع أعمدة الجدول = 100). */
  w: number;
  num?: boolean;
}
/** بطاقة في الملخص؛ `delta` مقارنة بالفترة السابقة («▲ من ١٨»). */
export interface SummaryItem {
  label: string;
  value: string;
  delta?: { dir: "up" | "down" | "same"; text: string };
}
export interface TableBlock {
  type: "table";
  columns: Column[];
  /** كل مجموعة وحدة بصرية (صفوف طالب واحد) لا تنقسم بين صفحتين ما أمكن. */
  groups: Cell[][][];
  empty: string;
}
export type Block =
  | { type: "summary"; items: SummaryItem[]; note?: string }
  | { type: "heading"; text: string; sub?: string }
  | { type: "student"; name: string; lines: { label: string; value: string }[] }
  | { type: "para"; text: string; tone?: "note" | "warn" }
  | { type: "break" }
  /** خانات التوقيع والختم في آخر التقرير الرسمي. */
  | { type: "sign"; labels: string[] }
  | TableBlock;

export interface ReportDoc {
  title: string;
  subtitle: string;
  halaqa: string;
  center: string | null;
  teacher: string | null;
  period: string;
  /** التصفيات الفعلية فقط (لا «جميع الطلاب» ولا «كل الأيام»). */
  filters: string[];
  generated: string;
  headerText: string;
  footerText: string;
  landscape: boolean;
  /** اسم الملف بلا امتداد («تقرير الحلقة - حلقة الفجر - أكتوبر 2026»). */
  fileBase: string;
  blocks: Block[];
  empty: boolean;
}

export { followUpText, gradeText, milestoneText } from "./sections";
/* ─────────── المستند ─────────── */

export function filtersOf(cfg: ReportConfig, c: Computed, schedule: number[]): string[] {
  const out: string[] = [];
  if (cfg.students)
    out.push(t("reports.filter.studentsSome", { n: fmtNum(c.students.length, cfg.digits, 0) }));
  const days = new Set(schedule);
  if (cfg.weekdays && cfg.weekdays.length && cfg.weekdays.length < Math.max(days.size, 1))
    out.push(
      `${t("reports.filter.days")}: ${cfg.weekdays.map((w) => t(`reports.weekday.${w}`)).join("، ")}`,
    );
  if (cfg.status !== "all") out.push(t(`reports.status.${cfg.status}`));
  if (cfg.grade !== "all")
    out.push(`${t("reports.filter.grade")}: ${gradeLabel(gradeKeyOf5(cfg.grade))}`);
  if (cfg.achievement !== "all") out.push(t(`reports.achievementFilter.${cfg.achievement}`));
  return out;
}

export function buildDoc(c: Computed, cfg: ReportConfig): ReportDoc {
  const s: NumberStyle = { digits: cfg.digits, calendar: cfg.calendar };
  const list = c.students;
  const h = c.data.halaqa;
  const blocks: Block[] = [];
  const kind = cfg.kind;
  const empty = !list.length || (!c.data.rows.length && !c.data.history.length);

  const period =
    c.data.from === c.data.to
      ? fmtDate(c.data.from, s)
      : t("reports.meta.periodRange", { from: fmtDate(c.data.from, s), to: fmtDate(c.data.to, s) });

  if (!empty) {
    if (kind !== "student" && cfg.template !== "brief") blocks.push(summaryBlock(c, cfg, s));
    if (kind !== "student" && list.some((x) => x.stats.followUp.length))
      blocks.push({ type: "para", tone: "note", text: t("reports.follow.legend") });
    if (kind === "student") {
      list.forEach((x, i) => {
        if (i > 0) blocks.push({ type: "break" });
        blocks.push(...studentBlocks(x, c, cfg, s));
        if (cfg.template === "official") blocks.push(signBlock("student"));
      });
    } else if (kind === "halaqa" && c.data.from === c.data.to) {
      // تقرير يوم واحد: سجل اليوم طالباً طالباً.
      blocks.push(...dailyBlocks(list, c, s));
    } else {
      if (has(cfg, "attendance")) {
        blocks.push({ type: "heading", text: t("reports.section.attendance") });
        blocks.push(attendanceTable(list, s));
      }
      const mem = has(cfg, "memorize");
      const rev = has(cfg, "review");
      if (mem || rev) {
        // قسم واحد من الاثنين ← سجله يوماً بيوم؛ الاثنان ← ملخص لكل طالب (أو تفصيل في القالب التفصيلي).
        const detailed = mem !== rev || cfg.template === "detailed";
        blocks.push({
          type: "heading",
          text: !rev
            ? t("reports.section.memorize")
            : !mem
              ? t("reports.section.review")
              : t("reports.section.work"),
        });
        blocks.push(detailed ? workLogTable(list, c, cfg, s) : workSummaryTable(list, cfg, s));
      }
      if (has(cfg, "evaluation")) {
        blocks.push({ type: "heading", text: t("reports.section.evaluation") });
        blocks.push(evaluationTable(list, c, s));
      }
      if (has(cfg, "achievement")) {
        blocks.push({ type: "heading", text: t("reports.section.achievement") });
        blocks.push(achievementTable(list, s));
      }
      if (kind === "halaqa" || kind === "achievement") {
        blocks.push({ type: "heading", text: t("reports.section.followUp") });
        blocks.push(followUpTable(list, s));
      }
      if (has(cfg, "notes")) {
        blocks.push({ type: "heading", text: t("reports.section.notes") });
        blocks.push(notesTable(list, s));
      }
    }
    const bad = c.issues.filter((i) => i.severity === "error").length;
    const warn = c.issues.length - bad;
    if (bad || warn)
      blocks.push({
        type: "para",
        tone: "warn",
        text: t(
          bad && warn
            ? "reports.validation.inReport"
            : bad
              ? "reports.validation.inReportBad"
              : "reports.validation.inReportWarn",
          { bad: fmtNum(bad, cfg.digits, 0), warn: fmtNum(warn, cfg.digits, 0) },
        ),
      });
    if (kind !== "student" && cfg.template === "official") blocks.push(signBlock("halaqa"));
  }

  // تقرير الطالب: العلامة بلا معنى بجانب اسمه وحده (الأسباب في «ملاحظات الأداء»).
  if (kind === "student")
    for (const b of blocks)
      if (b.type === "table")
        for (const g of b.groups) for (const r of g) for (const x of r) delete x.flag;

  const wide = blocks.some((b) => b.type === "table" && b.columns.length >= 8);
  // جدول عريض (8 أعمدة فأكثر) يُطبع أفقياً تلقائياً بدل تصغير الخط.
  const landscape = cfg.orientation === "landscape" || (cfg.orientation === "auto" && wide);

  const title =
    cfg.title.trim() ||
    (kind === "halaqa" && c.data.from === c.data.to
      ? t("reports.kindTitle.daily")
      : t(`reports.kindTitle.${kind}`));
  const subject = kind === "student" && list.length === 1 ? list[0].stats.student.name : h.name;
  return {
    title,
    fileBase: reportFileName({ title, subject, from: c.data.from, to: c.data.to }),
    subtitle: cfg.subtitle.trim() || period,
    halaqa: h.name,
    center: h.center_name,
    teacher: h.teacher_name,
    period,
    filters: filtersOf(
      cfg,
      c,
      c.data.schedule.map((x) => x.weekday),
    ),
    generated: t("reports.meta.generated", { date: fmtDate(c.data.today, s) }),
    headerText: cfg.header.text.trim(),
    footerText: cfg.footer.text.trim() || t("reports.meta.footerDefault"),
    landscape,
    blocks,
    empty,
  };
}
