/**
 * ملاءمة النص للمربع (Auto Fit): يصغّر الخط حتى يتسع النص — للأسماء الطويلة والمركّبة — حتى حدّ أدنى، ثم يعدّ
 * ما بقي فائضاً «نصاً مقصوصاً» يمنع الإصدار. لا قصّ بـ«…» (الإصدار القديم كان يقصّ الاسم).
 * القياس حقيقي في المتصفح بخط «ثمانية» نفسه (domMeasurer)، وتقديري في الاختبارات (estimateMeasurer).
 */
import { displayVars, fontCss, nearestWeight } from "./render";
import type { Design, Palette, TextEl } from "./model";
import { resolveText, type VarBag } from "./variables";

export const PT_MM = 25.4 / 72;

/** هل يتسع النص بهذا المقاس داخل المربع؟ */
export type Measurer = (el: TextEl, text: string, sizePt: number, palette: Palette) => boolean;

export interface FitResult {
  fitted: Record<string, number>;
  /** عناصر يفيض نصها حتى بأصغر مقاس مسموح. */
  overflow: string[];
}

export function fitDesign(d: Design, vars: VarBag, measure: Measurer, pending = true): FitResult {
  const fitted: Record<string, number> = {};
  const overflow: string[] = [];
  const shown = displayVars(vars, d);
  for (const el of d.elements) {
    if (el.type !== "text" || el.hidden) continue;
    const text = resolveText(el.text, shown, { allowPending: pending }).text;
    if (!text.trim()) continue;
    const max = el.font.size;
    if (measure(el, text, max, d.palette)) continue;
    if (!el.autoFit.enabled) {
      overflow.push(el.id);
      continue;
    }
    const min = Math.min(max, Math.max(4, el.autoFit.min));
    if (!measure(el, text, min, d.palette)) {
      fitted[el.id] = min;
      overflow.push(el.id);
      continue;
    }
    let lo = min;
    let hi = max;
    while (hi - lo > 0.25) {
      const mid = (lo + hi) / 2;
      if (measure(el, text, mid, d.palette)) lo = mid;
      else hi = mid;
    }
    fitted[el.id] = Math.floor(lo * 4) / 4;
  }
  return { fitted, overflow };
}

/**
 * تقدير بلا متصفح: عرض الحرف العربي بخط «ثمانية» ≈ 0.5em في المتوسط، والكلمة لا تنكسر، والأسطر بارتفاع
 * line-height. يكفي لاختبار المنطق (ومحافظ: يميل للتصغير أكثر من اللازم لا أقل).
 */
export const estimateMeasurer: Measurer = (el, text, size) => {
  const em = size * PT_MM;
  const ratio = 0.5 + (nearestWeight(el.font.weight) >= 500 ? 0.04 : 0);
  const avail = Math.max(1, el.w - 2 * el.padding);
  const space = em * 0.28;
  let lines = 0;
  for (const para of text.split("\n")) {
    let line = 0;
    lines++;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const w = word.length * em * (ratio + el.font.letterSpacing);
      if (w > avail) return false;
      if (line && line + space + w > avail) {
        lines++;
        line = w;
      } else line += (line ? space : 0) + w;
    }
  }
  return lines * em * el.font.lineHeight <= el.h - 2 * el.padding + 0.01;
};

/** قياس حقيقي في الصفحة بالخط المحمّل نفسه (المصمم والمعاينة والتحقق). */
export function domMeasurer(doc: Document = document): Measurer {
  let box: HTMLDivElement | null = null;
  const BASE =
    "position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box;height:auto";
  return (el, text, size, palette) => {
    if (!box) {
      box = doc.createElement("div");
      box.setAttribute("aria-hidden", "true");
      doc.body.appendChild(box);
    }
    box.dir = el.font.dir;
    box.style.cssText = `${BASE};${fontCss(el.font, palette, size)};width:${el.w - 2 * el.padding}mm`;
    box.textContent = text;
    const mm = doc.defaultView ? mmPx(doc) : 3.78;
    const fitsW = box.scrollWidth <= (el.w - 2 * el.padding) * mm + 0.5;
    const fitsH = box.scrollHeight <= (el.h - 2 * el.padding) * mm + 0.5;
    return fitsW && fitsH;
  };
}

let mmCache: number | null = null;
function mmPx(doc: Document): number {
  if (mmCache) return mmCache;
  const p = doc.createElement("div");
  p.style.cssText = "position:fixed;left:-20000px;width:100mm;height:1px;visibility:hidden";
  doc.body.appendChild(p);
  mmCache = p.getBoundingClientRect().width / 100 || 3.78;
  p.remove();
  return mmCache;
}
