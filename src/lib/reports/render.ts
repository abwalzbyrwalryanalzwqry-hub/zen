/**
 * رسم مستند التقرير HTML من اليمين لليسار: صفحات A4 ثابتة الأبعاد (للمعاينة والطباعة وPDF معاً)، بخط
 * «ثمانية» المضمَّن في التطبيق وأوزانه الأربعة (300/400/500/900)، ونص حقيقي قابل للتحديد لا صورة.
 */
import { t } from "@/lib/i18n";
import { fmtNum } from "./format";
import { readableColors, type ReportConfig } from "./config";
import type { Block, Cell, ReportDoc, TableBlock } from "./doc";
import type { Page } from "./paginate";

export const MM = 96 / 25.4;

/** أبعاد الصفحة بالمليمتر: هوامش وترويسة وتذييل ثابتة، فارتفاع المحتوى معروف قبل القياس. */
export function pageGeometry(landscape: boolean, header: boolean) {
  const w = landscape ? 297 : 210;
  const h = landscape ? 210 : 297;
  const pad = { x: 13, top: 10, bottom: 9 };
  const headerH = header ? 15 : 0;
  const footerH = 10;
  const contentW = w - pad.x * 2;
  const contentH = h - pad.top - pad.bottom - headerH - footerH;
  return { w, h, pad, headerH, footerH, contentW, contentH };
}

export function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

const SIZES = {
  header: { sm: 11, md: 13, lg: 15 },
  logo: { sm: 12, md: 16, lg: 22 },
  coverLogo: { sm: 16, md: 22, lg: 30 },
} as const;
const WEIGHT = { regular: 400, medium: 500, black: 900 } as const;
const ALIGN = { start: "flex-start", center: "center", end: "flex-end" } as const;

export function reportCss(cfg: ReportConfig, landscape: boolean, fontCss: string): string {
  const c = readableColors(cfg.colors).colors;
  const g = pageGeometry(landscape, cfg.header.show);
  return `${fontCss}
@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: "Zen Text", "Noto Naskh Arabic", serif; font-weight: 400; color: ${c.text};
  font-size: 10.5pt; line-height: 1.55; direction: rtl; text-align: right; font-synthesis: none;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; font-variant-numeric: tabular-nums; }
.page { position: relative; width: ${g.w}mm; height: ${g.h}mm; padding: ${g.pad.top}mm ${g.pad.x}mm ${g.pad.bottom}mm;
  background: #fff; overflow: hidden; display: flex; flex-direction: column; break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
.hdr { height: ${g.headerH}mm; flex: none; display: flex; align-items: center; gap: 3mm;
  justify-content: ${ALIGN[cfg.header.align]}; border-bottom: 0.4mm solid ${c.primary}; margin-bottom: 0; }
.hdr .ht { font-size: ${SIZES.header[cfg.header.size]}pt; font-weight: ${WEIGHT[cfg.header.weight]}; color: ${c.heading};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120mm; }
.hdr .hs { font-size: 8.5pt; color: #5b6b66; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90mm; }
.content { height: ${g.contentH}mm; flex: none; overflow: hidden; padding-top: 3mm; }
.ftr { height: ${g.footerH}mm; flex: none; display: flex; align-items: center; justify-content: space-between;
  border-top: 0.25mm solid ${c.border}; font-size: 8.5pt; font-weight: 300; color: #5b6b66; gap: 4mm; }
.ftr .pn { font-weight: 500; white-space: nowrap; }
.logo { display: inline-flex; align-items: center; justify-content: center; flex: none; }
.logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
.mark { border-radius: 2.5mm; background: ${c.primary}; color: #fff; font-weight: 900; display: inline-flex;
  align-items: center; justify-content: center; }
.cover { display: flex; flex-direction: column; gap: 1.5mm; padding-bottom: 3mm; margin-bottom: 3mm;
  border-bottom: 0.25mm solid ${c.border}; }
.cover .lg { display: flex; justify-content: ${ALIGN[cfg.logo.align]}; margin-bottom: 1mm; }
.cover .center { font-size: 11pt; font-weight: 500; color: #4a5a55; }
.cover h1 { margin: 0; font-size: 20pt; line-height: 1.35; font-weight: 900; color: ${c.heading}; }
.cover .sub { font-size: 11.5pt; font-weight: 500; color: ${c.text}; }
.cover .meta { display: flex; flex-wrap: wrap; gap: 1mm 6mm; font-size: 9.5pt; color: #4a5a55; }
.cover .meta b { font-weight: 500; color: ${c.text}; }
.cover .filters { font-size: 8.5pt; color: #5b6b66; }
.u { display: flow-root; }
h2 { margin: 4mm 0 2mm; font-size: 13pt; line-height: 1.4; font-weight: 900; color: ${c.heading};
  padding-inline-start: 2.5mm; border-inline-start: 1.2mm solid ${c.primary}; }
.summary { display: grid; grid-template-columns: repeat(4, 1fr); border: 0.25mm solid ${c.border}; border-radius: 2mm;
  overflow: hidden; margin: 1mm 0 2mm; }
.summary.c2 { grid-template-columns: repeat(2, 1fr); } .summary.c3 { grid-template-columns: repeat(3, 1fr); }
.summary.c1 { grid-template-columns: 1fr; }
.summary > div { padding: 2mm 3mm; border-inline-start: 0.25mm solid ${c.border}; border-top: 0.25mm solid ${c.border};
  margin-block-start: -0.25mm; margin-inline-start: -0.25mm; }
.summary .l { font-size: 8.5pt; color: #5b6b66; }
.summary .v { font-size: 13pt; font-weight: 500; color: ${c.text}; }
.summary .d { font-size: 8pt; color: #5b6b66; margin-top: 0.3mm; }
.summary .d.up { color: #1d7a4a; } .summary .d.down { color: #a4462e; }
.note { font-size: 9pt; color: #4a5a55; margin: 1mm 0 2mm; }
.para { font-size: 10pt; padding: 2.5mm 3mm; border-radius: 1.5mm; border: 0.25mm solid ${c.border}; margin: 1mm 0 2mm; }
.para.warn { border-color: #d9b45a; background: #fffaf0; }
.fl { color: #b7791f; font-size: 7pt; vertical-align: middle; }
.sign { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10mm; margin: 8mm 0 2mm; break-inside: avoid; }
.sign div { border-top: 0.3mm solid ${c.text}; padding-top: 1.5mm; font-size: 9.5pt; color: #4a5a55; text-align: center; min-height: 14mm; }
.student { border: 0.3mm solid ${c.border}; border-radius: 2mm; padding: 3mm; margin: 1mm 0 2mm; }
.student .n { font-size: 15pt; font-weight: 900; color: ${c.heading}; line-height: 1.35; }
.student .ls { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1mm 4mm; margin-top: 1.5mm; font-size: 9.5pt; }
.student .ls span { color: #5b6b66; } .student .ls b { font-weight: 500; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9.5pt; margin: 0 0 2mm; }
th { background: ${c.headerBg}; color: ${c.headerText}; font-weight: 500; padding: 1.6mm 2mm; text-align: right;
  border: 0.25mm solid ${c.headerBg}; line-height: 1.35; }
td { padding: 1.4mm 2mm; border: 0.25mm solid ${c.border}; vertical-align: middle; overflow-wrap: anywhere;
  word-break: normal; line-height: 1.45; }
tbody.z td { background: ${c.zebra}; }
td.nm, th.nm { text-align: center; font-weight: 500; unicode-bidi: plaintext; }
td.st { font-weight: 500; }
td.mu { color: #7b8a85; }
.empty td { text-align: center; color: #7b8a85; padding: 3mm; }
@media screen {
  html:has(body.preview), body.preview { background: #e9eeec; }
  body.preview { padding: 6mm 0; }
  body.preview .page { margin: 0 auto 6mm; box-shadow: 0 0.5mm 3mm rgba(0,0,0,.12); }
}
`;
}

function logoHtml(cfg: ReportConfig, mm: number): string {
  if (cfg.logo.mode === "none") return "";
  if (cfg.logo.mode === "custom" && cfg.logo.dataUrl)
    return `<span class="logo" style="width:${mm}mm;height:${mm}mm"><img alt="" src="${esc(cfg.logo.dataUrl)}"></span>`;
  return `<span class="logo mark" style="width:${mm}mm;height:${mm}mm;font-size:${(mm * 1.2).toFixed(1)}pt">${esc(t("reports.meta.mark"))}</span>`;
}

function cellHtml(c: Cell, num: boolean | undefined, extra = ""): string {
  const cls = [num || c.num ? "nm" : "", c.strong ? "st" : "", c.muted ? "mu" : ""]
    .filter(Boolean)
    .join(" ");
  const flag = c.flag
    ? `<span class="fl" aria-label="${esc(t("reports.follow.mark"))}">●</span> `
    : "";
  return `<td${cls ? ` class="${cls}"` : ""}${extra}>${flag}${esc(c.text)}</td>`;
}

/** جدول كامل أو جزء منه (صفوف مختارة)، والرأس دائماً. */
export function tableHtml(
  b: TableBlock,
  rows?: { group: number; from: number; to: number }[] | null,
  measure = false,
): string {
  const cols = b.columns.map((c) => `<col style="width:${c.w}%">`).join("");
  const head = `<thead${measure ? ' data-h="1"' : ""}><tr>${b.columns
    .map((c) => `<th${c.num ? ' class="nm"' : ""}>${esc(c.label)}</th>`)
    .join("")}</tr></thead>`;
  if (!b.groups.length)
    return `<table><colgroup>${cols}</colgroup>${head}<tbody class="empty"${measure ? ' data-e="1"' : ""}><tr><td colspan="${b.columns.length}">${esc(b.empty)}</td></tr></tbody></table>`;
  const parts = rows ?? b.groups.map((g, i) => ({ group: i, from: 0, to: g.length }));
  const body = parts
    .map(({ group, from, to }) => {
      const g = b.groups[group];
      const slice = g.slice(from, to);
      const trs = slice
        .map((r, ri) =>
          r
            .map((c, ci) => {
              if (c.span) {
                if (ri > 0) return "";
                return cellHtml(
                  c,
                  b.columns[ci]?.num,
                  slice.length > 1 ? ` rowspan="${slice.length}"` : "",
                );
              }
              return cellHtml(c, b.columns[ci]?.num);
            })
            .join(""),
        )
        .map((cells) => `<tr${measure ? ' data-r="1"' : ""}>${cells}</tr>`)
        .join("");
      return `<tbody${group % 2 ? ' class="z"' : ""}${measure ? ` data-g="${group}"` : ""}>${trs}</tbody>`;
    })
    .join("");
  return `<table><colgroup>${cols}</colgroup>${head}${body}</table>`;
}

/**
 * أعمدة شبكة الملخص حسب عدد البطاقات: لا بطاقة وحيدة في الصف الأخير (٩ ← ٣×٣، ٧ ← ٤+٣، ٥ ← ٣+٢).
 */
export function summaryCols(n: number): number {
  if (n <= 4) return Math.max(1, n);
  if (n % 4 === 0) return 4;
  if (n % 3 === 0) return 3;
  return n % 4 >= 2 ? 4 : 3;
}

export function blockHtml(b: Block): string {
  switch (b.type) {
    case "heading":
      return `<h2>${esc(b.text)}${b.sub ? ` <small>${esc(b.sub)}</small>` : ""}</h2>`;
    case "summary": {
      const n = summaryCols(b.items.length);
      return `<div class="summary c${n}">${b.items
        .map(
          (i) =>
            `<div><div class="l">${esc(i.label)}</div><div class="v">${esc(i.value)}</div>${
              i.delta ? `<div class="d ${i.delta.dir}">${esc(i.delta.text)}</div>` : ""
            }</div>`,
        )
        .join("")}</div>${b.note ? `<div class="note">${esc(b.note)}</div>` : ""}`;
    }
    case "student":
      return `<div class="student"><div class="n">${esc(b.name)}</div><div class="ls">${b.lines
        .map((l) => `<div><span>${esc(l.label)}: </span><b>${esc(l.value)}</b></div>`)
        .join("")}</div></div>`;
    case "para":
      return `<div class="para${b.tone === "warn" ? " warn" : ""}">${esc(b.text)}</div>`;
    case "break":
      return "";
    case "sign":
      return `<div class="sign">${b.labels.map((l) => `<div>${esc(l)}</div>`).join("")}</div>`;
    case "table":
      return tableHtml(b);
  }
}

/**
 * رأس الصفحة الأولى. الشعار واسم المركز يظهران مرة واحدة: في الترويسة إن كانت ظاهرة، وإلا هنا.
 */
export function coverHtml(doc: ReportDoc, cfg: ReportConfig): string {
  const inHeader = cfg.header.show;
  const lg = inHeader ? "" : logoHtml(cfg, SIZES.coverLogo[cfg.logo.size]);
  const headerName = doc.headerText || doc.center || doc.halaqa;
  const showCenter = !!doc.center && (!inHeader || headerName !== doc.center);
  const meta = [
    [t("reports.meta.halaqa"), doc.halaqa],
    ...(doc.teacher ? [[t("reports.meta.teacher"), doc.teacher]] : []),
    [t("reports.meta.period"), doc.period],
  ];
  return `<div class="cover">${lg ? `<div class="lg">${lg}</div>` : ""}${
    showCenter ? `<div class="center">${esc(doc.center!)}</div>` : ""
  }<h1>${esc(doc.title)}</h1>${doc.subtitle && doc.subtitle !== doc.period ? `<div class="sub">${esc(doc.subtitle)}</div>` : ""}<div class="meta">${meta
    .map(([k, v]) => `<span>${esc(k)}: <b>${esc(v)}</b></span>`)
    .join("")}<span>${esc(doc.generated)}</span></div>${
    doc.filters.length
      ? `<div class="filters">${esc(t("reports.meta.filters"))}: ${esc(doc.filters.join(" · "))}</div>`
      : ""
  }</div>`;
}

/** الترويسة؛ في الصفحة الأولى بلا عنوان التقرير (العنوان الكبير تحتها مباشرة). */
function headerHtml(doc: ReportDoc, cfg: ReportConfig, first = false): string {
  if (!cfg.header.show) return "";
  const text = doc.headerText || doc.center || doc.halaqa;
  return `<div class="hdr">${logoHtml(cfg, SIZES.logo[cfg.logo.size] * 0.6)}<span class="ht">${esc(text)}</span>${
    first ? "" : `<span class="hs">${esc(doc.title)}</span>`
  }</div>`;
}

function footerHtml(doc: ReportDoc, cfg: ReportConfig, n: number, total: number): string {
  const d = cfg.digits;
  const pn = cfg.footer.pageNumbers
    ? cfg.footer.pageTotal
      ? t("reports.meta.pageOf", { n: fmtNum(n, d, 0), total: fmtNum(total, d, 0) })
      : t("reports.meta.page", { n: fmtNum(n, d, 0) })
    : "";
  return `<div class="ftr"><span>${cfg.footer.show ? esc(doc.footerText) : ""}</span><span class="pn">${esc(pn)}</span></div>`;
}

/** مستند القياس: كل قطعة في حاوية بعرض المحتوى، لقياس ارتفاعها الحقيقي بالخط نفسه. */
export function measureHtml(doc: ReportDoc, cfg: ReportConfig, css: string): string {
  const g = pageGeometry(doc.landscape, cfg.header.show);
  const parts = [`<div class="u" data-u="cover">${coverHtml(doc, cfg)}</div>`];
  doc.blocks.forEach((b, i) => {
    if (b.type === "table")
      parts.push(`<div class="u" data-u="${i}">${tableHtml(b, null, true)}</div>`);
    else if (b.type !== "break") parts.push(`<div class="u" data-u="${i}">${blockHtml(b)}</div>`);
  });
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body><div style="width:${g.contentW}mm">${parts.join("")}</div></body></html>`;
}

/** المستند النهائي: صفحات بترويسة وتذييل وترقيم «الصفحة ١ من ٣». */
export function pagedHtml(
  doc: ReportDoc,
  cfg: ReportConfig,
  css: string,
  pages: Page[],
  opts: { preview?: boolean; autoPrint?: boolean } = {},
): string {
  const total = pages.length;
  const body = pages
    .map((p, pi) => {
      const content = p
        .map((piece) => {
          if (piece.kind === "block") {
            if (piece.index === -1) return `<div class="u">${coverHtml(doc, cfg)}</div>`;
            const b = doc.blocks[piece.index];
            return b ? `<div class="u">${blockHtml(b)}</div>` : "";
          }
          const b = doc.blocks[piece.index] as TableBlock;
          return `<div class="u">${tableHtml(b, b.groups.length ? piece.rows : null)}</div>`;
        })
        .join("");
      return `<section class="page" data-page="${pi + 1}">${headerHtml(doc, cfg, pi === 0)}<div class="content">${content}</div>${footerHtml(doc, cfg, pi + 1, total)}</section>`;
    })
    .join("");
  const print = opts.autoPrint
    ? "\u003Cscript>window.onload = () => setTimeout(() => window.print(), 350);\u003C/script>"
    : "";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(doc.fileBase)}</title><style>${css}</style></head><body${opts.preview ? ' class="preview"' : ""}>${body}${print}</body></html>`;
}
