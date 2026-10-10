/**
 * الطباعة على ورق مطبوع مسبقاً (1.26.0، فحص الاستوديو المرحلة 5 — الفكرة 8): وضع «الحقول فقط» يُبقي النصوص التي
 * فيها متغيّرات (الاسم والتاريخ والرقم والإنجاز) ورمز QR، ويحذف الإطار والخلفية والزخارف والصور والنصوص الثابتة
 * المطبوعة على الورق. إزاحة المعايرة (مم) تُحفظ لكل مركز على الجهاز، وورقة المعايرة تُطبع على ورق عادي وتوضع
 * فوق الورقة المطبوعة لقياس الفرق.
 */
import { make, type CertElement, type Design, type PageSpec } from "./model";

export interface Offset {
  dx: number;
  dy: number;
}
export const MAX_OFFSET = 20;
const clamp = (n: number) =>
  Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, Number.isFinite(n) ? Math.round(n * 2) / 2 : 0));

export function cleanOffset(o: Partial<Offset> | null | undefined): Offset {
  return { dx: clamp(Number(o?.dx ?? 0)), dy: clamp(Number(o?.dy ?? 0)) };
}

/** هل العنصر «حقل» يتغيّر من شهادة لأخرى؟ */
export function isField(e: CertElement): boolean {
  if (e.hidden) return false;
  if (e.type === "qr") return true;
  return e.type === "text" && /\{\{\s*[a-zA-Z]/.test(e.text);
}

export function fieldsOnly(d: Design, offset: Offset = { dx: 0, dy: 0 }): Design {
  const o = cleanOffset(offset);
  return {
    ...d,
    page: { ...d.page, background: "#ffffff", backgroundImage: null, pattern: null },
    elements: d.elements
      .filter(isField)
      .map((e): CertElement =>
        e.type === "text"
          ? { ...e, x: e.x + o.dx, y: e.y + o.dy, background: null }
          : { ...e, x: e.x + o.dx, y: e.y + o.dy },
      ),
  };
}

function labelText(x: number, y: number, text: string): CertElement {
  const el = make.text({ x, y, w: 120, h: 20, text });
  return { ...el, font: { ...el.font, size: 10, color: "#000000", align: "center" } };
}

/** ورقة معايرة: صلبان عند 20 مم من كل ركن وفي الوسط، ومسطرة 50 مم. */
export function calibrationDesign(page: PageSpec, label: string): Design {
  const W = page.width;
  const H = page.height;
  const cross = (x: number, y: number): CertElement[] => [
    make.line({ x: x - 6, y: y - 0.2, w: 12, h: 0.4, stroke: "#000000", strokeWidth: 0.3 }),
    make.line({
      x: x - 6,
      y: y - 0.2,
      w: 12,
      h: 0.4,
      rotation: 90,
      stroke: "#000000",
      strokeWidth: 0.3,
    }),
  ];
  const pts: [number, number][] = [
    [20, 20],
    [W - 20, 20],
    [20, H - 20],
    [W - 20, H - 20],
    [W / 2, H / 2],
  ];
  return {
    v: 1,
    page: { ...page, background: "#ffffff", backgroundImage: null, pattern: null },
    palette: {
      primary: "#000000",
      accent: "#000000",
      ink: "#000000",
      paper: "#ffffff",
      muted: "#444444",
    },
    numbers: { digits: "arab", calendar: "gregorian" },
    elements: [
      ...pts.flatMap(([x, y]) => cross(x, y)),
      make.line({ x: W / 2 - 25, y: 32, w: 50, h: 0.4, stroke: "#000000", strokeWidth: 0.3 }),
      labelText(W / 2 - 60, 36, label),
    ],
  };
}

const KEY = (center: string) => `zen.cert.offset.${center}`;
export function loadOffset(center: string): Offset {
  try {
    return cleanOffset(JSON.parse(localStorage.getItem(KEY(center)) ?? "null"));
  } catch {
    return { dx: 0, dy: 0 };
  }
}
export function saveOffset(center: string, o: Offset) {
  try {
    localStorage.setItem(KEY(center), JSON.stringify(cleanOffset(o)));
  } catch {
    /* التخزين ممتلئ أو ممنوع: الإزاحة للجلسة فقط */
  }
}
