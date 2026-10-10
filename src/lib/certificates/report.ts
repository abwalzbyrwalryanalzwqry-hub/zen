/**
 * تقرير الشهائد: يُبنى على نموذج تصدير التقارير القائم (ExportDoc ← exportExcel) لا تصديراً جديداً.
 */
import type { ExportDoc } from "@/lib/center-export";
import { t } from "@/lib/i18n";
import type { CertListItem, CertStats } from "./api";

export function certificatesReportDoc(
  items: CertListItem[],
  stats: CertStats | null,
  scope: string,
): ExportDoc {
  const s = (k: string) => t(`certificates.${k}`);
  return {
    title: `${s("home.report")}${scope ? ` — ${scope}` : ""}`,
    subtitle: s("report.subtitle"),
    stats: stats
      ? [
          { label: s("stats.total"), value: String(stats.total) },
          { label: s("stats.month"), value: String(stats.month) },
          { label: s("stats.year"), value: String(stats.year) },
          { label: s("stats.revoked"), value: String(stats.revoked) },
          { label: s("stats.students"), value: String(stats.students) },
        ]
      : [],
    sheets: [
      {
        title: s("report.sheet"),
        columns: [
          "number",
          "student",
          "center",
          "halaqa",
          "type",
          "template",
          "date",
          "status",
        ].map((c) => s(`col.${c}`)),
        rows: items.map((c) => [
          c.certificate_number ?? "—",
          c.student_name,
          c.center_name ?? "",
          c.halaqa_name ?? "",
          c.type_name ?? "",
          c.template_name ?? "",
          c.issue_date ?? "",
          s(`status.${c.status}`),
        ]),
      },
      ...(stats
        ? [
            {
              title: s("stats.byType"),
              columns: [s("col.type"), s("col.count")],
              rows: stats.by_type.map((x) => [x.name, x.count]),
            },
            {
              title: s("stats.byHalaqa"),
              columns: [s("col.halaqa"), s("col.count")],
              rows: stats.by_halaqa.map((x) => [x.name, x.count]),
            },
            {
              title: s("stats.byTemplate"),
              columns: [s("col.template"), s("col.count")],
              rows: stats.by_template.map((x) => [x.name, x.count]),
            },
            {
              title: s("stats.byMonth"),
              columns: [s("col.month"), s("col.count")],
              rows: stats.by_month.map((x) => [x.month, x.count]),
            },
          ]
        : []),
    ],
  };
}
