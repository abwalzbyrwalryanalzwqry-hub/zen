import { ATTENDANCE_LABEL, KIND_LABEL } from "@/lib/zen-lms";
import { printHtml, saveFile } from "@/lib/native-file";
import { MASTERY_LABEL } from "@/lib/exam/types";
import {
  RISK_LABEL,
  attendanceRate,
  slotLabel,
  type CenterDashboard,
  type CenterKpis,
  type StudentReport,
} from "@/lib/center";
import { AR_LATN } from "@/lib/i18n";

/**
 * تصدير التقارير: نموذج واحد (ExportDoc) يُحوَّل إلى PDF (نافذة طباعة) أو Excel.
 * مكتبة Excel (write-excel-file) تُحمَّل عند الضغط فقط حتى لا تثقل الحزمة الأولى.
 */

export type Cell = string | number | null;
export type ExportSheet = { title: string; columns: string[]; rows: Cell[][] };
export type ExportDoc = {
  title: string;
  subtitle: string;
  stats: { label: string; value: string }[];
  sheets: ExportSheet[];
};

const MUSHAF_KIND: Record<string, string> = {
  memorize: "حفظ",
  review: "مراجعة",
  consolidate: "تثبيت",
};
const ASSIGNMENT_STATUS: Record<string, string> = {
  pending: "قيد الانتظار",
  submitted: "مُسلَّم",
  approved: "معتمد",
  redo: "إعادة",
};

const dash = (v: number | null | undefined, suffix = "") => (v == null ? "—" : `${v}${suffix}`);

export function studentReportDoc(r: StudentReport): ExportDoc {
  const rate = attendanceRate(r.attendance_summary);
  const avgScore = r.assessments.filter((a) => a.score != null);
  const avg = avgScore.length
    ? Math.round(avgScore.reduce((s, a) => s + (a.score ?? 0), 0) / avgScore.length)
    : null;
  return {
    title: `تقرير الطالب — ${r.student?.name ?? "طالب"}`,
    subtitle: `من ${r.from} إلى ${r.to}${r.halaqat.length ? ` · ${r.halaqat.map((h) => h.name).join("، ")}` : ""}`,
    stats: [
      { label: "نسبة الحضور", value: dash(rate, "%") },
      { label: "صفحات محفوظة", value: String(r.mushaf_summary.memorized_pages ?? 0) },
      { label: "صفحات مراجعة", value: String(r.mushaf_summary.reviewed_pages ?? 0) },
      { label: "تسميعات", value: String(r.assessments.length) },
      { label: "متوسط التسميع", value: dash(avg) },
      { label: "اختبارات", value: String(r.exams.length) },
    ],
    sheets: [
      {
        title: "الحضور",
        columns: ["التاريخ", "الحالة", "السبب"],
        rows: r.attendance.map((a) => [
          a.date,
          ATTENDANCE_LABEL[a.status] ?? a.status,
          a.reason ?? "",
        ]),
      },
      {
        title: "المصحف",
        columns: ["التاريخ", "الصفحة", "النوع", "التقييم", "ملاحظات"],
        rows: r.mushaf.map((m) => [
          m.date,
          m.page,
          MUSHAF_KIND[m.kind] ?? m.kind,
          m.rating,
          m.notes ?? "",
        ]),
      },
      {
        title: "التسميع",
        columns: ["التاريخ", "السورة", "من", "إلى", "الدرجة", "الحالة", "ملاحظات المعلّم"],
        rows: r.assessments.map((a) => [
          a.date,
          a.surah_name,
          a.from_ayah,
          a.to_ayah,
          a.score,
          a.approved ? "معتمد" : "إعادة",
          a.teacher_notes ?? "",
        ]),
      },
      {
        title: "الواجبات",
        columns: ["الاستحقاق", "النوع", "السورة", "من", "إلى", "الحالة"],
        rows: r.assignments.map((a) => [
          a.due_date,
          KIND_LABEL[a.kind] ?? a.kind,
          a.surah_name,
          a.from_ayah,
          a.to_ayah,
          ASSIGNMENT_STATUS[a.status] ?? a.status,
        ]),
      },
      {
        title: "الاختبارات",
        columns: ["التاريخ", "الاختبار", "النسبة", "المستوى"],
        rows: r.exams.map((e) => [
          e.date,
          e.title,
          e.percentage,
          MASTERY_LABEL[e.mastery] ?? e.mastery,
        ]),
      },
    ],
  };
}

export function centerDashboardDoc(d: CenterDashboard, k?: CenterKpis | null): ExportDoc {
  const t = d.totals;
  const doc: ExportDoc = {
    title: `تقرير ${d.center?.name ?? "المركز"}`,
    subtitle: `آخر ${d.period_days} يوماً (منذ ${d.since})`,
    stats: [
      { label: "الحلقات", value: String(t.halaqat) },
      { label: "الطلاب", value: String(t.students) },
      { label: "المعلّمون", value: String(t.teachers) },
      { label: "نسبة الحضور", value: dash(t.attendance_rate, "%") },
      { label: "صفحات محفوظة", value: String(t.pages_memorized) },
      { label: "متوسط التسميع", value: dash(t.avg_score) },
      { label: "يحتاجون متابعة", value: String(t.at_risk) },
    ],
    sheets: [
      {
        title: "الحلقات",
        columns: [
          "الحلقة",
          "المعلّم",
          "الطلاب",
          "حضور",
          "تأخر",
          "غياب",
          "عذر",
          "نسبة الحضور",
          "صفحات محفوظة",
          "تسميعات",
          "متوسط التسميع",
          "متوسط الاختبارات",
          "المواعيد",
        ],
        rows: d.halaqat.map((h) => [
          h.name,
          h.teacher_name ?? "",
          h.students,
          h.present,
          h.late,
          h.absent,
          h.excused,
          dash(attendanceRate(h), "%"),
          h.pages_memorized,
          h.assessments,
          h.avg_score,
          h.avg_exam,
          h.slots.map(slotLabel).join("، "),
        ]),
      },
      {
        title: "المعلّمون",
        columns: [
          "المعلّم",
          "الحلقات",
          "الطلاب",
          "حضور مسجّل",
          "تسميعات مقيّمة",
          "واجبات",
          "آخر نشاط",
        ],
        rows: d.teachers.map((x) => [
          x.name ?? "",
          x.halaqat,
          x.students,
          x.attendance_marked,
          x.assessments,
          x.assignments,
          x.last_activity ?? "",
        ]),
      },
      {
        title: "يحتاجون متابعة",
        columns: ["الطالب", "الحلقة", "نسبة الحضور", "متوسط التسميع", "آخر نشاط", "الأسباب"],
        rows: d.at_risk.map((s) => [
          s.name,
          s.halaqat ?? "",
          dash(s.attendance_rate, "%"),
          s.avg_score,
          s.last_activity ?? "",
          s.reasons.map((r) => RISK_LABEL[r] ?? r).join("، "),
        ]),
      },
      {
        title: "الحضور أسبوعياً",
        columns: ["بداية الأسبوع", "السجلات", "نسبة الحضور"],
        rows: d.weekly.map((w) => [w.week, w.records, dash(w.rate, "%")]),
      },
    ],
  };
  if (k) doc.sheets.push(...kpiSheets(k));
  return doc;
}

/** مؤشرات 10.3 في التصدير: لكل حلقة (آخر 30 يوماً) والاتجاه الشهري. */
export function kpiSheets(k: CenterKpis): ExportSheet[] {
  return [
    {
      title: "مؤشرات الحلقات",
      columns: [
        "الحلقة",
        "الطلاب",
        "صفحات (30 يوماً)",
        "صفحات لكل طالب",
        "الانتظام",
        "المنقطعون",
        "نسبة التسرّب",
      ],
      rows: k.halaqat.map((h) => [
        h.name,
        h.students,
        h.pages_30,
        h.pages_per_student,
        dash(h.regularity, "%"),
        h.dropouts,
        dash(h.dropout_rate, "%"),
      ]),
    },
    {
      title: "الاتجاه الشهري",
      columns: ["الشهر", "صفحات محفوظة", "نسبة الحضور", "طلاب نشطون"],
      rows: k.monthly.map((m) => [
        m.month,
        m.pages,
        dash(m.attendance_rate, "%"),
        m.active_students,
      ]),
    },
  ];
}

function esc(s: string) {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

export function buildExportHtml(doc: ExportDoc): string {
  const today = new Date().toLocaleDateString(AR_LATN, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const sheets = doc.sheets
    .map(
      (s) =>
        `<h2>${esc(s.title)}</h2>${
          s.rows.length
            ? `<table><thead><tr>${s.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${s.rows
                .map(
                  (r) =>
                    `<tr>${r.map((c) => `<td>${esc(c == null ? "—" : String(c))}</td>`).join("")}</tr>`,
                )
                .join("")}</tbody></table>`
            : `<p class="muted">لا توجد بيانات.</p>`
        }`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8" />
<title>${esc(doc.title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", "Noto Naskh Arabic", Tahoma, sans-serif; color:#12241d; margin:0; }
  h1 { font-size:20px; margin:0; }
  .head { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #0f766e; padding-bottom:10px; }
  .brand { color:#0f766e; font-weight:800; font-size:24px; }
  .muted { color:#6b7c76; font-size:12px; }
  .stats { display:flex; gap:8px; margin:14px 0; flex-wrap:wrap; }
  .stat { flex:1; min-width:100px; border:1px solid #d7e5e0; border-radius:10px; padding:8px; text-align:center; background:#f6fbf9; font-size:12px; }
  .stat b { display:block; font-size:18px; color:#0f766e; }
  h2 { font-size:14px; margin:16px 0 6px; color:#0f766e; }
  table { width:100%; border-collapse:collapse; font-size:11px; page-break-inside:auto; }
  tr { page-break-inside:avoid; }
  th, td { border:1px solid #d7e5e0; padding:5px 6px; text-align:right; }
  th { background:#eef7f4; }
  footer { margin-top:18px; border-top:1px solid #d7e5e0; padding-top:6px; font-size:10px; color:#6b7c76; text-align:center; }
</style></head>
<body>
  <div class="head">
    <div><div class="brand">Zen</div><div class="muted">${esc(doc.subtitle)}</div></div>
    <div style="text-align:left"><h1>${esc(doc.title)}</h1><div class="muted">صدر في ${today}</div></div>
  </div>
  <div class="stats">${doc.stats.map((s) => `<div class="stat"><b>${esc(s.value)}</b>${esc(s.label)}</div>`).join("")}</div>
  ${sheets}
  <footer>تقرير من تطبيق Zen</footer>
  \u003Cscript>window.onload = () => setTimeout(() => window.print(), 350);\u003C/script>
</body></html>`;
}

/** مربع الطباعة («حفظ بتنسيق PDF»): الأصلي في تطبيق Android، ونافذة طباعة خارجه. */
export async function exportPdf(doc: ExportDoc, target?: Window | null): Promise<void> {
  await printHtml(buildExportHtml(doc), doc.title, target);
}

/** اسم ورقة Excel: 31 حرفاً كحد أقصى وبلا الرموز الممنوعة. */
export function sheetName(title: string, used: Set<string>): string {
  const base =
    title
      .replace(/[\\/?*[\]:]/g, " ")
      .trim()
      .slice(0, 28) || "ورقة";
  let name = base;
  let i = 2;
  while (used.has(name)) name = `${base} ${i++}`;
  used.add(name);
  return name;
}

const HEADER_BG = "#0F766E";

type XlsxCell = {
  value: string | number;
  type?: typeof String | typeof Number;
  fontWeight?: "bold";
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
};

/** الأوراق كما تُكتب: الملخص أولاً ثم ورقة لكل جدول، من اليمين لليسار وصف العناوين مثبَّت. */
export function workbookSheets(doc: ExportDoc, headerBg: string = HEADER_BG) {
  const used = new Set<string>();
  const text = (v: unknown): XlsxCell =>
    typeof v === "number"
      ? { value: v, type: Number }
      : { value: v == null ? "" : String(v), type: String };
  const summary = {
    sheet: sheetName("الملخص", used),
    rightToLeft: true,
    columns: [{ width: 28 }, { width: 18 }],
    data: [
      [{ ...text(doc.title), fontWeight: "bold" as const, fontSize: 14 }],
      [text(doc.subtitle)],
      [text("")],
      ...doc.stats.map((s) => [text(s.label), text(s.value)]),
    ] as XlsxCell[][],
  };
  const tables = doc.sheets.map((s) => ({
    sheet: sheetName(s.title, used),
    rightToLeft: true,
    stickyRowsCount: 1,
    columns: s.columns.map((col, i) => {
      const longest = Math.max(col.length, ...s.rows.map((r) => String(r[i] ?? "").length));
      return { width: Math.min(Math.max(longest + 2, 8), 50) };
    }),
    data: [
      s.columns.map((c): XlsxCell => ({
        ...text(c),
        fontWeight: "bold",
        color: "#FFFFFF",
        backgroundColor: headerBg,
      })),
      ...s.rows.map((r) => r.map(text)),
    ] as XlsxCell[][],
  }));
  return [summary, ...tables];
}

/** ملف Excel (xlsx) من اليمين لليسار، بمكتبة صغيرة (write-excel-file) تُحمَّل عند الضغط فقط. */
export async function excelBlob(doc: ExportDoc, headerBg?: string): Promise<Blob> {
  const { default: writeExcelFile } = await import("write-excel-file/universal");
  return writeExcelFile(workbookSheets(doc, headerBg) as never, { fontFamily: "Arial" }).toBlob();
}

export async function exportExcel(doc: ExportDoc, filename: string) {
  const blob = await excelBlob(doc);
  await saveFile(filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`, blob, {
    title: doc.title,
  });
}
