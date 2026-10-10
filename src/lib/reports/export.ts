/**
 * التصدير: Excel (أوراق منظّمة من اليمين لليسار بالمكتبة الموجودة في center-export)، وCSV خام، وPDF
 * (ملف حقيقي في تطبيق Android عبر ZenPrint.toPdf، ومربع الطباعة خارجه). الأرقام في Excel وCSV قيم رقمية
 * لاتينية قابلة للحساب، والتنسيق العربي للعرض فقط.
 */
import { t } from "@/lib/i18n";
import { excelBlob, type ExportDoc, type ExportSheet } from "@/lib/center-export";
import { isNative, printHtml, safeFileName, saveFile, type SaveOutcome } from "@/lib/native-file";
import { registerPlugin } from "@capacitor/core";
import { gradeKeyOf5, gradeLabel } from "@/lib/grading";
import { EVAL_CRITERIA } from "@/lib/daily-record";
import { evaluationAverages, workLines } from "./calc";
import { roundTo } from "./format";
import { contrast, DEFAULT_COLORS, type ReportConfig } from "./config";
import { milestoneText, followUpText, type ReportDoc } from "./doc";
import type { Computed } from "./compute";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

const r1 = (n: number | null) => (n == null ? null : roundTo(n, 1));
const gradeName = (g: number | null) => (g == null ? "" : gradeLabel(gradeKeyOf5(g)));
const latin = { digits: "latn", calendar: "gregorian" } as const;

function point(
  seg: { surah_name: string; from_ayah: number; to_ayah: number } | undefined,
  end: boolean,
) {
  return seg ? `${seg.surah_name} ${end ? seg.to_ayah : seg.from_ayah}` : "";
}

export function exportDocOf(c: Computed, cfg: ReportConfig, doc: ReportDoc): ExportDoc {
  const has = (r: string) => cfg.records.includes(r as never);
  const sheets: ExportSheet[] = [];
  const list = c.students;
  if (has("attendance"))
    sheets.push({
      title: t("reports.section.attendance"),
      columns: [
        t("reports.col.name"),
        t("reports.col.present"),
        t("reports.col.late"),
        t("reports.col.excused"),
        t("reports.col.absent"),
        t("reports.col.total"),
        t("reports.col.ratePct"),
      ],
      rows: list.map(({ stats: s }) => [
        s.student.name,
        s.attendance.present,
        s.attendance.late,
        s.attendance.excused,
        s.attendance.absent,
        s.attendance.marked,
        s.attendance.rate,
      ]),
    });
  for (const kind of ["memorize", "review"] as const) {
    if (!has(kind)) continue;
    const ids = new Map(list.map((x) => [x.stats.student.id, x.stats.student.name]));
    const lines = workLines(
      c.data.rows.filter((r) => ids.has(r.student_id)),
      [kind],
    );
    sheets.push({
      title: t(`reports.section.${kind}`),
      columns: [
        t("reports.col.name"),
        t("reports.col.date"),
        t("reports.col.from"),
        t("reports.col.to"),
        t("reports.col.ayahs"),
        t("reports.col.pages"),
        t("reports.col.gradeNum"),
        t("reports.col.grade"),
        t("reports.col.note"),
      ],
      rows: lines.map((l) => [
        ids.get(l.studentId) ?? "",
        l.date,
        point(l.segments[0], false),
        point(l.segments[l.segments.length - 1], true),
        l.ayahs,
        l.pages,
        l.grade,
        gradeName(l.grade),
        l.notes ?? "",
      ]),
    });
  }
  if (has("evaluation"))
    sheets.push({
      title: t("reports.section.evaluation"),
      columns: [t("reports.col.name"), ...EVAL_CRITERIA.map((k) => t(`dailyRecord.eval.${k}`))],
      rows: list.map(({ stats: s }) => {
        const a = evaluationAverages(c.data.rows.filter((r) => r.student_id === s.student.id));
        return [s.student.name, ...EVAL_CRITERIA.map((k) => r1(a[k]))];
      }),
    });
  if (has("achievement"))
    sheets.push({
      title: t("reports.section.achievement"),
      columns: [
        t("reports.col.name"),
        t("reports.col.lastPoint"),
        t("reports.col.juz"),
        t("reports.col.surahs"),
        t("reports.col.progressPct"),
        t("reports.col.milestones"),
        t("reports.col.reason"),
      ],
      rows: list.map(({ stats: s, journey: j, milestones }) => [
        s.student.name,
        j.last ? point(j.last, true) : "",
        j.completedJuz.length,
        j.completedSurahs,
        j.pct,
        milestones.map((m) => milestoneText(m, latin)).join("، "),
        s.followUp.map((f) => followUpText(f, latin)).join("؛ "),
      ]),
    });
  if (has("notes"))
    sheets.push({
      title: t("reports.section.notes"),
      columns: [t("reports.col.name"), t("reports.col.date"), t("reports.col.note")],
      rows: list.flatMap(({ stats: s }) => s.notes.map((n) => [s.student.name, n.date, n.text])),
    });
  const T = c.totals;
  return {
    title: doc.title,
    subtitle: `${doc.halaqa} · ${doc.period}`,
    stats: [
      { label: t("reports.sum.students"), value: String(T.students) },
      { label: t("reports.sum.days"), value: String(T.days) },
      { label: t("reports.sum.present"), value: String(T.present + T.late) },
      { label: t("reports.sum.absent"), value: String(T.absent) },
      { label: t("reports.sum.excused"), value: String(T.excused) },
      { label: t("reports.sum.rate"), value: T.rate == null ? "" : `${T.rate}%` },
      { label: t("reports.sum.memorizePages"), value: String(roundTo(T.memorizePages, 1)) },
      { label: t("reports.sum.reviewPages"), value: String(roundTo(T.reviewPages, 1)) },
      { label: t("reports.sum.avgGrade"), value: T.avgGrade == null ? "" : String(r1(T.avgGrade)) },
    ],
    sheets,
  };
}

/** لون رأس أوراق Excel: لون التقرير إن قرأ عليه النص الأبيض، وإلا الافتراضي. */
const excelHeader = (cfg: ReportConfig) =>
  contrast("#ffffff", cfg.colors.headerBg) >= 4.5 ? cfg.colors.headerBg : DEFAULT_COLORS.headerBg;

export async function downloadExcel(c: Computed, cfg: ReportConfig, doc: ReportDoc) {
  const blob = await excelBlob(exportDocOf(c, cfg, doc), excelHeader(cfg));
  return saveFile(`${doc.fileBase}.xlsx`, blob, { title: doc.title });
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV خام: سطر لكل يوم لكل طالب، بترميز UTF-8 مع BOM ليفتحه Excel بالعربية صحيحة. */
export function csvText(c: Computed): string {
  const names = new Map(c.students.map((x) => [x.stats.student.id, x.stats.student.name]));
  const head = [
    "date",
    "student",
    "status",
    "memorize_from",
    "memorize_to",
    "memorize_pages",
    "memorize_grade",
    "review_from",
    "review_to",
    "review_pages",
    "review_grade",
    "evaluation_overall",
    "note",
  ];
  const rows = c.data.rows
    .filter((r) => names.has(r.student_id))
    .map((r) => {
      const [m] = workLines([r], ["memorize"]);
      const [v] = workLines([r], ["review"]);
      return [
        r.date,
        names.get(r.student_id),
        r.status ?? "",
        point(m?.segments[0], false),
        point(m?.segments[m.segments.length - 1], true),
        m?.pages ?? "",
        m?.grade ?? "",
        point(v?.segments[0], false),
        point(v?.segments[v.segments.length - 1], true),
        v?.pages ?? "",
        v?.grade ?? "",
        r.evaluation?.overall ?? "",
        r.note ?? "",
      ];
    });
  return "\uFEFF" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function downloadCsv(c: Computed, cfg: ReportConfig, doc: ReportDoc) {
  const blob = new Blob([csvText(c)], { type: "text/csv;charset=utf-8" });
  return saveFile(`${doc.fileBase}.csv`, blob, { title: doc.title });
}

type ZenPrintPdf = {
  toPdf(o: { html: string; name: string; landscape: boolean }): Promise<{ uri: string }>;
};
const ZenPrint = registerPlugin<ZenPrintPdf>("ZenPrint");

/**
 * PDF: في التطبيق يُكتب ملف PDF نصّي حقيقي (WebView ← PrintDocumentAdapter) ثم تُفتح ورقة المشاركة
 * (حفظ في الملفات أو Drive أو إرسال)؛ وإن تعذّر يُفتح مربع الطباعة. خارج التطبيق مربع الطباعة («حفظ PDF»).
 */
export async function exportPdf(
  html: string,
  cfg: ReportConfig,
  doc: ReportDoc,
): Promise<SaveOutcome | "printed"> {
  const name = safeFileName(doc.fileBase);
  if (isNative()) {
    try {
      const { uri } = await ZenPrint.toPdf({ html, name, landscape: doc.landscape });
      const { Share } = await import("@capacitor/share");
      try {
        await Share.share({ title: doc.title, files: [uri], dialogTitle: doc.title });
        return "shared";
      } catch {
        return "cancelled";
      }
    } catch (e) {
      console.warn("[reports] toPdf failed, falling back to print", e);
      await printHtml(html, name);
      return "printed";
    }
  }
  await printHtml(html, doc.fileBase);
  return "printed";
}

/** مشاركة: ملف PDF في التطبيق؛ وفي المتصفح ملف Excel عبر مشاركة الويب إن دعمت الملفات، وإلا تنزيله. */
export async function shareReport(
  html: string,
  c: Computed,
  cfg: ReportConfig,
  doc: ReportDoc,
): Promise<SaveOutcome | "printed"> {
  if (isNative()) return exportPdf(html, cfg, doc);
  const blob = await excelBlob(exportDocOf(c, cfg, doc), excelHeader(cfg));
  const file = new File([blob], `${doc.fileBase}.xlsx`, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const nav = navigator as Navigator & {
    canShare?: (d: ShareData) => boolean;
    share?: (d: ShareData) => Promise<void>;
  };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ title: doc.title, files: [file] });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  return saveFile(file.name, blob, { title: doc.title });
}
