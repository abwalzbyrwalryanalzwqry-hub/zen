/**
 * تركيب شهادة طالب واحد: هوية المركز ← تجميد المراجع، ثم الرسم، ثم ملاءمة النصوص، ثم إعادة الرسم بالمقاسات
 * الملائمة. الناتج نفسه يُعرض في المعاينة ويُصدَّر، ومنه نتائج الفحص (متغيّرات ناقصة، نص فائض).
 */
import { freezeBrand, type CertBrand } from "./brand";
import { fitDesign, type Measurer } from "./fit";
import type { Design } from "./model";
import { renderPage, type AssetData, type ElementIssue } from "./render";
import type { VarBag } from "./variables";

export interface Sources {
  assets: Record<string, AssetData>;
  brand: CertBrand | null;
  /** brand:<key> ← asset:<id>. */
  refs: Record<string, string>;
}

export interface Composed {
  html: string;
  design: Design;
  issues: ElementIssue[];
  overflow: string[];
  fitted: Record<string, number>;
}

export function composePage(
  design: Design,
  vars: VarBag,
  src: Sources,
  o: {
    uid: string;
    pending?: boolean;
    placeholders?: boolean;
    qrSvg?: string | null;
    measure?: Measurer | null;
  },
): Composed {
  const frozen = freezeBrand(design, src.brand, src.refs);
  const fit = o.measure
    ? fitDesign(frozen, vars, o.measure, o.pending)
    : { fitted: {}, overflow: [] };
  const r = renderPage(frozen, {
    vars,
    assets: src.assets,
    brand: src.refs,
    qrSvg: o.qrSvg ?? null,
    pending: o.pending,
    placeholders: o.placeholders,
    fitted: fit.fitted,
    uid: o.uid,
  });
  return {
    html: r.html,
    design: frozen,
    issues: r.issues,
    overflow: fit.overflow,
    fitted: fit.fitted,
  };
}

/** مراجع الأصول اللازمة للرسم (asset:<id> مباشرة أو عبر الهوية). */
export function neededAssetIds(design: Design, refs: Record<string, string>): string[] {
  const out = new Set<string>();
  const add = (r: string | null | undefined) => {
    if (!r) return;
    const x = r.startsWith("brand:") ? refs[r.slice(6)] : r;
    if (x?.startsWith("asset:")) out.add(x.slice(6));
  };
  add(design.page.backgroundImage);
  for (const e of design.elements) {
    if (e.type === "image") add(e.src);
    if (e.type === "signature") add(e.src);
  }
  return [...out];
}
