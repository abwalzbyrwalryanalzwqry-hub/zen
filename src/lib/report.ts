import { printHtml } from "@/lib/native-file";
import { AR_LATN } from "@/lib/i18n";

export type ReportSession = {
  date: string;
  title: string;
  detail: string;
  note?: string | null;
  rating?: number | null;
};

export type ReportInput = {
  studentName: string;
  rangeLabel: string;
  stats: { label: string; value: string }[];
  daily: ReportSession[];
  weekly: { week: string; count: number; detail: string }[];
  aiSummary: string;
};

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}

export function buildReportHtml(r: ReportInput): string {
  const today = new Date().toLocaleDateString(AR_LATN, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8" />
<title>تقرير حفظ — ${esc(r.studentName)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", "Noto Naskh Arabic", Tahoma, sans-serif; color:#12241d; margin:0; }
  h1 { font-size:22px; margin:0; }
  .head { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #0f766e; padding-bottom:10px; }
  .brand { color:#0f766e; font-weight:800; font-size:26px; }
  .muted { color:#6b7c76; font-size:12px; }
  .stats { display:flex; gap:8px; margin:16px 0; flex-wrap:wrap; }
  .stat { flex:1; min-width:110px; border:1px solid #d7e5e0; border-radius:12px; padding:10px; text-align:center; background:#f6fbf9; }
  .stat b { display:block; font-size:20px; color:#0f766e; }
  h2 { font-size:15px; margin:18px 0 8px; color:#0f766e; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { border:1px solid #d7e5e0; padding:6px 8px; text-align:right; }
  th { background:#eef7f4; }
  .ai { border:1px solid #e0c56b; background:#fffaec; border-radius:12px; padding:12px; font-size:13px; white-space:pre-line; line-height:1.9; }
  footer { margin-top:22px; border-top:1px solid #d7e5e0; padding-top:8px; font-size:11px; color:#6b7c76; text-align:center; }
</style></head>
<body>
  <div class="head">
    <div><div class="brand">Zen</div><div class="muted">تقرير جلسات الحفظ</div></div>
    <div style="text-align:left"><h1>${esc(r.studentName)}</h1><div class="muted">${esc(r.rangeLabel)} · صدر في ${today}</div></div>
  </div>

  <div class="stats">
    ${r.stats.map((s) => `<div class="stat"><b>${esc(s.value)}</b>${esc(s.label)}</div>`).join("")}
  </div>

  <h2>الجلسات اليومية</h2>
  ${
    r.daily.length
      ? `<table><thead><tr><th style="width:90px">التاريخ</th><th>الجلسة</th><th>التفاصيل</th><th style="width:70px">التقييم</th></tr></thead><tbody>
      ${r.daily
        .map(
          (d) =>
            `<tr><td>${esc(d.date)}</td><td>${esc(d.title)}</td><td>${esc(d.detail)}${
              d.note ? ` — ${esc(d.note)}` : ""
            }</td><td>${d.rating ? "★".repeat(d.rating) : "—"}</td></tr>`,
        )
        .join("")}
      </tbody></table>`
      : `<p class="muted">لا توجد جلسات مسجّلة.</p>`
  }

  <h2>الملخص الأسبوعي</h2>
  ${
    r.weekly.length
      ? `<table><thead><tr><th style="width:150px">الأسبوع</th><th style="width:80px">الجلسات</th><th>التفاصيل</th></tr></thead><tbody>
      ${r.weekly.map((w) => `<tr><td>${esc(w.week)}</td><td>${w.count}</td><td>${esc(w.detail)}</td></tr>`).join("")}
      </tbody></table>`
      : `<p class="muted">لا توجد بيانات أسبوعية.</p>`
  }

  <h2>ملخص وتوصيات مساعد Zen</h2>
  <div class="ai">${esc(r.aiSummary)}</div>

  <footer>تم إنشاء هذا التقرير تلقائياً بواسطة تطبيق Zen — بارك الله في جهدك</footer>
  \u003Cscript>window.onload = () => setTimeout(() => window.print(), 350);\u003C/script>
</body></html>`;
}

/** مربع الطباعة («حفظ بتنسيق PDF»): الأصلي في تطبيق Android، ونافذة طباعة خارجه. */
export async function openReportPdf(input: ReportInput): Promise<void> {
  await printHtml(buildReportHtml(input), `تقرير-${input.studentName}`);
}

export function weekLabel(iso: string): string {
  const d = new Date(iso);
  const day = d.getDay(); // 0 = Sunday
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const f = (x: Date) => x.toLocaleDateString(AR_LATN, { day: "numeric", month: "short" });
  return `${f(start)} – ${f(end)}`;
}
