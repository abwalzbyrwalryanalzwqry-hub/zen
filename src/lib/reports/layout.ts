/**
 * تخطيط التقرير في المتصفح: يضمّن خط الواجهة «Zen Text» (data URL، فيعمل في مربع الطباعة الأصلي بلا شبكة)، ويقيس
 * كل قطعة في إطار مخفي بالأبعاد والخط نفسيهما، ثم يقسم الصفحات بـ paginate ويرسمها.
 */
import uiFont from "@/assets/fonts/markazi-text.woff2?url";
import { UI_FONT_FAMILY, UI_FONT_WEIGHT_RANGE } from "@/lib/brand-font";
import { blobToBase64 } from "@/lib/native-file";
import { MM, measureHtml, pageGeometry, pagedHtml, reportCss } from "./render";
import { paginate, type Page, type Unit } from "./paginate";
import type { ReportConfig } from "./config";
import type { ReportDoc } from "./doc";

/** ملف الخط المتغيّر (العربية واللاتينية وكل الأوزان). */
const FACES: string[] = [uiFont];

let fontCache: Promise<string> | null = null;

/** @font-face لملف الخط مضمّناً. إن تعذّر التحميل يبقى الخط الاحتياطي (Noto Naskh) لا فشل. */
export function embeddedFontCss(): Promise<string> {
  fontCache ??= Promise.all(
    FACES.map(async (url) => {
      try {
        const blob = await (await fetch(url)).blob();
        const b64 = await blobToBase64(blob);
        return `@font-face{font-family:"${UI_FONT_FAMILY}";src:url(data:font/woff2;base64,${b64}) format("woff2");font-weight:${UI_FONT_WEIGHT_RANGE};font-style:normal;font-display:block;}`;
      } catch {
        return "";
      }
    }),
  ).then((parts) => parts.join("\n"));
  return fontCache;
}

export interface LaidOut {
  pages: Page[];
  css: string;
  preview: string;
  print: string;
}

function frame(): HTMLIFrameElement {
  const f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  f.tabIndex = -1;
  Object.assign(f.style, {
    position: "fixed",
    insetInlineStart: "-10000px",
    top: "0",
    width: "1200px",
    height: "800px",
    visibility: "hidden",
    pointerEvents: "none",
  });
  document.body.appendChild(f);
  return f;
}

/**
 * ينتظر تحميل الخطوط فعلاً قبل القياس: `fonts.ready` وحدها قد تُحلّ قبل أن يبدأ تحميل الخط فتُقاس القطع
 * بخط بديل أصغر، فيفيض المحتوى في الصفحة الحقيقية. نُجبر التخطيط ثم نحمّل كل وجه خط معرّف.
 */
async function ready(doc: Document): Promise<void> {
  try {
    void doc.body?.offsetHeight;
    const faces = doc.fonts ? [...(doc.fonts as unknown as Iterable<FontFace>)] : [];
    await Promise.all(faces.map((f) => f.load().catch(() => null)));
    await doc.fonts?.ready;
  } catch {
    /* لا شيء */
  }
  await new Promise((r) => setTimeout(r, 30));
}

const heightOf = (el: Element | null) => (el ? el.getBoundingClientRect().height : 0);

export function unitsFrom(doc: Document, rd: ReportDoc): Unit[] {
  const units: Unit[] = [];
  units.push({ kind: "block", index: -1, h: heightOf(doc.querySelector('[data-u="cover"]')) });
  let breakNext = false;
  rd.blocks.forEach((b, i) => {
    if (b.type === "break") {
      breakNext = true;
      return;
    }
    const el = doc.querySelector(`[data-u="${i}"]`);
    if (b.type === "table") {
      const tableMargin = 2 * MM;
      // ارتفاع كل صف = المسافة إلى بداية الصف التالي (يشمل الحدود المدمجة التي لا يحسبها ارتفاع tr
      // وحده)، والأخير حتى نهاية الجدول؛ وإلا يُستهان بالجداول الطويلة فيفيض المحتوى في الصفحة.
      const table = el?.querySelector("table") ?? null;
      const tb = table?.getBoundingClientRect();
      const trs = [...(el?.querySelectorAll("tbody[data-g] tr") ?? [])];
      const tops = trs.map((tr) => tr.getBoundingClientRect().top);
      const rowH = new Map(
        trs.map((tr, k) => [tr, (k + 1 < tops.length ? tops[k + 1] : (tb?.bottom ?? 0)) - tops[k]]),
      );
      const theadH = heightOf(el?.querySelector("thead") ?? null);
      units.push({
        kind: "table",
        index: i,
        headerH: (tb && tops.length ? tops[0] - tb.top : theadH) + tableMargin,
        emptyH: heightOf(el?.querySelector("tbody[data-e]") ?? null),
        groups: [...(el?.querySelectorAll("tbody[data-g]") ?? [])].map((g) => ({
          rows: [...g.querySelectorAll("tr")].map((tr) => rowH.get(tr) ?? heightOf(tr)),
        })),
      });
    } else {
      units.push({
        kind: "block",
        index: i,
        h: heightOf(el),
        keepWithNext: b.type === "heading" || b.type === "student",
        breakBefore: breakNext,
      });
    }
    breakNext = false;
  });
  return units;
}

/** أكبر فيض (px) في محتوى أي صفحة من المستند المرسوم. */
async function overflowOf(d: Document, html: string): Promise<number> {
  d.open();
  d.write(html);
  d.close();
  await ready(d);
  let over = 0;
  for (const c of d.querySelectorAll<HTMLElement>("section.page .content"))
    over = Math.max(over, c.scrollHeight - c.clientHeight);
  return over;
}

export async function layoutReport(rd: ReportDoc, cfg: ReportConfig): Promise<LaidOut> {
  const fonts = await embeddedFontCss();
  const css = reportCss(cfg, rd.landscape, fonts);
  const f = frame();
  try {
    const d = f.contentDocument!;
    d.open();
    d.write(measureHtml(rd, cfg, css));
    d.close();
    await ready(d);
    const g = pageGeometry(rd.landscape, cfg.header.show);
    // المحتوى ناقص حشوته العليا (3mm) وهامش أمان صغير ضد فروق التقريب بين القياس والطباعة.
    const pageH = (g.contentH - 3) * MM - 4;
    const units = unitsFrom(d, rd);
    let pages = paginate(units, pageH);
    // تحقق نهائي: تُرسم الصفحات الحقيقية في إطار القياس، وإن فاضت صفحة (فرق تقريب في الحدود أو الخطوط)
    // يُعاد التقسيم بارتفاع أقل بمقدار الفيض. لا صفحة تُقص في المعاينة ولا في PDF.
    for (let pass = 0, h = pageH; pass < 3; pass++) {
      const over = await overflowOf(d, pagedHtml(rd, cfg, css, pages));
      if (over <= 0) break;
      h -= over + 2;
      pages = paginate(units, h);
    }
    return {
      pages,
      css,
      preview: pagedHtml(rd, cfg, css, pages, { preview: true }),
      print: pagedHtml(rd, cfg, css, pages, { autoPrint: true }),
    };
  } finally {
    f.remove();
  }
}
