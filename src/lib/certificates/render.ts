/**
 * محرّك الرسم الوحيد للشهادة: تصميم + قيم ← HTML بوحدات المليمتر. المصمم والمعاينة وPDF وPNG والطباعة
 * كلها ترسم هذا الناتج نفسه، فما يراه المعلّم هو ما يُطبع. النص يبقى نصاً حقيقياً (لا لقطة شاشة) بخط
 * «ثمانية» واتجاه RTL، والزخارف SVG متجهة.
 */
import { fmtDate } from "@/lib/reports/format";
import {
  color,
  FONT_WEIGHTS,
  type CertElement,
  type Design,
  type FontSpec,
  type FontWeight,
  type ImageEl,
  type Palette,
  type SignatureEl,
  type TextEl,
} from "./model";
import { frameSvg, ornamentSvg, patternSvg } from "./ornaments";
import { resolveText, type VarBag } from "./variables";

export interface AssetData {
  data_url: string;
  width?: number | null;
  height?: number | null;
}

export interface RenderCtx {
  vars: VarBag;
  /** بيانات الصور بالمرجع (asset:<id>). */
  assets: Record<string, AssetData>;
  /** مراجع هوية المركز: brand:logo ← asset:<id>. */
  brand?: Record<string, string>;
  qrSvg?: string | null;
  /** قبل الإصدار: رقم الشهادة يُعرض نموذجاً ولا يُعدّ ناقصاً. */
  pending?: boolean;
  /** مقاسات الخط بعد الملاءمة التلقائية (pt) لكل عنصر. */
  fitted?: Record<string, number>;
  /** مربعات بديلة للصور الناقصة (في المصمم فقط). */
  placeholders?: boolean;
  /** يفرّق تعريفات SVG حين تجتمع عدة شهادات في ملف واحد. */
  uid: string;
}

export interface ElementIssue {
  id: string;
  missing: string[];
  unknown: string[];
  missingImage?: boolean;
}

export interface Rendered {
  html: string;
  issues: ElementIssue[];
}

export const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** قيمة من قائمة مغلقة أو الافتراضي (لا تدخل سمة HTML قيمة غير متوقعة). */
const pick = <T extends string>(v: unknown, list: readonly T[], def: T): T =>
  list.includes(v as T) ? (v as T) : def;
const ALIGNS = ["right", "center", "left", "justify"] as const;
const FITS = ["contain", "cover", "fill"] as const;
const DIRS = ["rtl", "ltr", "auto"] as const;
const DASHES = ["solid", "dashed", "dotted"] as const;

const n2 = (v: number) => Math.round(v * 100) / 100;

/** أقرب وزن متوفر فعلاً من الخط. */
export function nearestWeight(w: number): FontWeight {
  return FONT_WEIGHTS.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
}

export function fontCss(font: FontSpec, p: Palette, size = font.size): string {
  return [
    `font-family:'Zen Text','Noto Naskh Arabic',serif`,
    `font-weight:${nearestWeight(font.weight)}`,
    `font-size:${n2(size)}pt`,
    `color:${color(font.color, p)}`,
    `text-align:${pick(font.align, ALIGNS, "center")}`,
    `line-height:${n2(font.lineHeight)}`,
    `letter-spacing:${n2(font.letterSpacing)}em`,
  ].join(";");
}

/** قيم العرض: التواريخ بنمط الشهادة (أرقام وتقويم)، والباقي كما هو. */
export function displayVars(vars: VarBag, d: Design): VarBag {
  const style = d.numbers;
  const fmt = (v: unknown) =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDate(v, style) : v;
  const out: VarBag = { ...vars };
  if (vars.certificate)
    out.certificate = { ...vars.certificate, date: fmt(vars.certificate.date) as string };
  if (vars.period)
    out.period = {
      from: fmt(vars.period.from) as string,
      to: fmt(vars.period.to) as string,
    };
  return out;
}

export function resolveImage(ref: string | null | undefined, ctx: RenderCtx): AssetData | null {
  if (!ref) return null;
  let r = ref;
  if (r.startsWith("brand:")) r = ctx.brand?.[r.slice(6)] ?? "";
  if (r === "var:center.logo") r = ctx.brand?.logo ?? "";
  return r ? (ctx.assets[r] ?? null) : null;
}

function imageHtml(src: AssetData | null, el: ImageEl, ctx: RenderCtx): string {
  if (!src) return ctx.placeholders ? `<div class="ce-ph"></div>` : "";
  const url = esc(src.data_url);
  const radius = el.radius ? `border-radius:${n2(el.radius)}mm;` : "";
  if (el.crop && el.crop.w > 0 && el.crop.h > 0) {
    const c = el.crop;
    return `<div style="position:absolute;inset:0;overflow:hidden;${radius}"><img alt="" src="${url}" style="position:absolute;width:${n2(100 / c.w)}%;height:${n2(100 / c.h)}%;left:${n2((-c.x / c.w) * 100)}%;top:${n2((-c.y / c.h) * 100)}%;object-fit:fill"/></div>`;
  }
  return `<img alt="" src="${url}" style="width:100%;height:100%;object-fit:${pick(el.fit, FITS, "contain")};${radius}display:block"/>`;
}

function textHtml(el: TextEl, d: Design, ctx: RenderCtx, issues: ElementIssue[]): string {
  const r = resolveText(el.text, ctx.vars, { allowPending: ctx.pending });
  if (r.missing.length || r.unknown.length)
    issues.push({ id: el.id, missing: r.missing, unknown: r.unknown });
  const size = ctx.fitted?.[el.id] ?? el.font.size;
  const justify =
    el.vAlign === "top" ? "flex-start" : el.vAlign === "bottom" ? "flex-end" : "center";
  const bg = el.background ? `background:${color(el.background, d.palette)};` : "";
  return `<div class="ce-text" dir="${pick(el.font.dir, DIRS, "rtl")}" style="justify-content:${justify};padding:${n2(el.padding)}mm;${bg}${fontCss(el.font, d.palette, size)}"><span>${esc(r.text)}</span></div>`;
}

function signatureHtml(el: SignatureEl, d: Design, ctx: RenderCtx, issues: ElementIssue[]): string {
  const name = resolveText(el.signer, ctx.vars, { allowPending: ctx.pending });
  const label = resolveText(el.label, ctx.vars, { allowPending: ctx.pending });
  const missing = [...name.missing, ...label.missing];
  const unknown = [...name.unknown, ...label.unknown];
  const img = resolveImage(el.src, ctx);
  if (missing.length || unknown.length || (el.required && !img))
    issues.push({ id: el.id, missing, unknown, missingImage: el.required && !img });
  const size = ctx.fitted?.[el.id] ?? el.font.size;
  const pic = img
    ? `<img alt="" src="${esc(img.data_url)}" style="max-width:100%;max-height:100%;object-fit:contain"/>`
    : ctx.placeholders && el.src
      ? `<div class="ce-ph" style="position:relative;width:60%;height:80%"></div>`
      : "";
  const line = el.showLine
    ? `<div style="width:80%;border-top:0.3mm solid ${color(el.lineColor, d.palette)};margin:0.6mm auto 0.8mm"></div>`
    : "";
  return `<div class="ce-sig" dir="rtl" style="${fontCss(el.font, d.palette, size)}">
<div class="ce-sig-img">${pic}</div>${line}<div class="ce-sig-name" style="font-weight:${nearestWeight(Math.max(500, el.font.weight))}">${esc(name.text)}</div>
<div class="ce-sig-label" style="opacity:.8;font-size:${n2(size * 0.85)}pt">${esc(label.text)}</div></div>`;
}

function elementInner(el: CertElement, d: Design, ctx: RenderCtx, issues: ElementIssue[]): string {
  const p = d.palette;
  switch (el.type) {
    case "text":
      return textHtml(el, d, ctx, issues);
    case "image": {
      const src = resolveImage(el.src, ctx);
      if (el.required && !src)
        issues.push({ id: el.id, missing: [], unknown: [], missingImage: true });
      return imageHtml(src, el, ctx);
    }
    case "shape": {
      const radius =
        el.shape === "ellipse" ? "50%" : el.shape === "roundRect" ? `${n2(el.radius || 3)}mm` : "0";
      return `<div style="position:absolute;inset:0;box-sizing:border-box;background:${color(el.fill, p)};border:${n2(el.strokeWidth)}mm solid ${color(el.stroke, p)};border-radius:${radius}"></div>`;
    }
    case "line":
      return `<div style="position:absolute;left:0;right:0;top:50%;border-top:${n2(el.strokeWidth)}mm ${pick(el.dash, DASHES, "solid")} ${color(el.stroke, p)};transform:translateY(-50%)"></div>`;
    case "frame":
      return frameSvg(
        el.frame,
        el.w,
        el.h,
        color(el.color, p),
        color(el.color2, p),
        el.thickness,
        `${ctx.uid}-${esc(el.id)}`,
      );
    case "ornament":
      return ornamentSvg(el.ornament, color(el.color, p), color(el.color2, p));
    case "qr":
      return ctx.qrSvg
        ? `<div class="ce-qrbox" style="background:${color(el.background, p)}">${ctx.qrSvg}</div>`
        : ctx.placeholders
          ? `<div class="ce-ph ce-ph-qr"></div>`
          : "";
    case "signature":
      return signatureHtml(el, d, ctx, issues);
  }
}

/** صفحة الشهادة كاملة (عنصر HTML واحد بقياسها الحقيقي). */
export function renderPage(d: Design, ctx: RenderCtx): Rendered {
  const issues: ElementIssue[] = [];
  const c = { ...ctx, vars: displayVars(ctx.vars, d) };
  const pg = d.page;
  const bgImg = resolveImage(pg.backgroundImage, c);
  const layers: string[] = [];
  if (bgImg)
    layers.push(
      `<img alt="" src="${esc(bgImg.data_url)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${pick(pg.backgroundFit, FITS, "cover")}"/>`,
    );
  if (pg.pattern && pg.pattern.kind !== "none")
    layers.push(
      `<div style="position:absolute;inset:0">${patternSvg(pg.pattern.kind, pg.width, pg.height, color(pg.pattern.color, d.palette), pg.pattern.opacity, ctx.uid)}</div>`,
    );
  d.elements.forEach((el, i) => {
    if (el.hidden) return;
    const style = [
      `left:${n2(el.x)}mm`,
      `top:${n2(el.y)}mm`,
      `width:${n2(el.w)}mm`,
      `height:${n2(el.h)}mm`,
      `z-index:${i + 1}`,
      el.opacity < 1 ? `opacity:${n2(el.opacity)}` : "",
      el.rotation ? `transform:rotate(${n2(el.rotation)}deg)` : "",
    ]
      .filter(Boolean)
      .join(";");
    layers.push(
      `<div class="ce ce-${el.type}" data-id="${esc(el.id)}" style="${style}">${elementInner(el, d, c, issues)}</div>`,
    );
  });
  const html = `<div class="cert-page" dir="ltr" style="width:${n2(pg.width)}mm;height:${n2(pg.height)}mm;background:${color(pg.background, d.palette)}">${layers.join("")}</div>`;
  return { html, issues };
}

/** أنماط الشهادة المشتركة (المعاينة والطباعة). */
export const CERT_CSS = `
.cert-page{position:relative;overflow:hidden;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:"Zen Text","Noto Naskh Arabic",serif;color:#1d2a24}
.cert-page *{box-sizing:border-box}
.ce{position:absolute;transform-origin:center center}
.ce svg{display:block;width:100%;height:100%}
.ce-text{position:absolute;inset:0;display:flex;flex-direction:column;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;unicode-bidi:plaintext}
.ce-text>span{display:block;width:100%}
.ce-sig{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;text-align:center;line-height:1.35}
.ce-sig-img{flex:1;min-height:0;width:100%;display:flex;align-items:flex-end;justify-content:center}
.ce-qrbox{position:absolute;inset:0;padding:4%}
.ce-ph{position:absolute;inset:0;border:0.35mm dashed rgba(31,93,70,.45);background:repeating-linear-gradient(45deg,rgba(31,93,70,.06) 0 2mm,transparent 2mm 4mm);border-radius:1mm}
.cert-void{position:absolute;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;font-size:48pt;font-weight:900;color:rgba(170,30,30,.28);transform:rotate(-24deg);letter-spacing:.1em;pointer-events:none}
.ce-ph-qr{background:repeating-conic-gradient(rgba(29,42,36,.25) 0 25%,transparent 0 50%) 0 0/3mm 3mm}
`;

/**
 * مستند طباعة/PDF: صفحة لكل شهادة بقياسها بالضبط (@page)، بلا هوامش ولا صفحة زائدة في النهاية.
 */
export function printDocument(
  pages: string[],
  size: { width: number; height: number },
  fontFaces: string,
  title: string,
): string {
  const body = pages
    .map(
      (p, i) =>
        `<section class="sheet"${i === pages.length - 1 ? ' style="break-after:auto;page-break-after:auto"' : ""}>${p}</section>`,
    )
    .join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${fontFaces}
@page{size:${n2(size.width)}mm ${n2(size.height)}mm;margin:0}
html,body{margin:0;padding:0;background:#fff}
.sheet{width:${n2(size.width)}mm;height:${n2(size.height)}mm;overflow:hidden;break-after:page;page-break-after:always}
${CERT_CSS}</style></head><body>${body}</body></html>`;
}
