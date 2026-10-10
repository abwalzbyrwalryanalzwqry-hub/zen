/**
 * نموذج تصميم الشهادة في «استوديو الشهائد» — docs/CERTIFICATES.md.
 *
 * التصميم عناصر حقيقية (نص، صورة، شكل، خط، إطار، زخرفة، QR، توقيع) بإحداثيات بالمليمتر على صفحة بقياس
 * حقيقي، لا صورة ثابتة. الإحداثيات فيزيائية (x من يسار الورقة) والنص نفسه RTL. الألوان قيم أو رموز لوحة
 * (`$primary` …) تُحلّ من لوحة التصميم، فيتبع القالبُ هويةَ المركز. الصور مراجع فقط:
 *   asset:<uuid>              أصل مرفوع في المركز (certificate_assets)
 *   brand:logo | brand:logo_white | brand:stamp | brand:signature:<role>   من هوية المركز، تُحلّ وقت الإصدار
 * فالتصميم خفيف ويُجمَّد كما هو مع الشهادة.
 */
import { UI_FONT_FAMILY } from "@/lib/brand-font";

export const DESIGN_VERSION = 1;

export type PageSizeKey = "A4" | "A5" | "Letter" | "custom";
export type Orientation = "portrait" | "landscape";

/** القياسات بالمليمتر (العرض × الارتفاع عمودياً). */
export const PAGE_SIZES: Record<Exclude<PageSizeKey, "custom">, [number, number]> = {
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
};

export const MIN_PAGE_MM = 50;
export const MAX_PAGE_MM = 1000;

export interface PageSpec {
  size: PageSizeKey;
  orientation: Orientation;
  width: number;
  height: number;
  /** هامش القص للطباعة الاحترافية (مم)، يُرسم دليلاً فقط. */
  bleed: number;
  /** المنطقة الآمنة من الحافة (مم): التحقق ينبّه لما يخرج عنها. */
  safe: number;
  background: string;
  backgroundImage?: string | null;
  backgroundFit?: ImageFit;
  pattern?: { kind: PatternKind; color: string; opacity: number } | null;
}

export type PatternKind = "none" | "girih" | "stars" | "lattice" | "dots";

export interface Palette {
  primary: string;
  accent: string;
  ink: string;
  paper: string;
  muted: string;
}

export const DEFAULT_PALETTE: Palette = {
  primary: "#1f5d46",
  accent: "#b08d57",
  ink: "#1d2a24",
  paper: "#fbf8f1",
  muted: "#6b7a72",
};

export type FontWeight = 300 | 400 | 500 | 900;
/**
 * أوزان التصميم (ثابتة للتوافق مع التصاميم المحفوظة). خط الواجهة متغيّر 400–700، فيقصّ المتصفح 300 إلى 400
 * و900 إلى 700 (src/lib/brand-font.ts).
 */
export const FONT_WEIGHTS: FontWeight[] = [300, 400, 500, 900];
export const FONT_FAMILY = UI_FONT_FAMILY;

export type TextAlign = "right" | "center" | "left" | "justify";
export type VAlign = "top" | "middle" | "bottom";
export type ImageFit = "contain" | "cover" | "fill";

export type ElementRole =
  | "title"
  | "subtitle"
  | "studentName"
  | "body"
  | "achievement"
  | "number"
  | "date"
  | "header"
  | "logo"
  | "stamp"
  | "signature"
  | "qr"
  | "decoration";

interface Base {
  id: string;
  name?: string;
  role?: ElementRole;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  hidden?: boolean;
  locked?: boolean;
  groupId?: string | null;
}

export interface FontSpec {
  family: string;
  weight: FontWeight;
  /** بالنقطة (pt) كما في برامج التصميم. */
  size: number;
  color: string;
  align: TextAlign;
  lineHeight: number;
  /** بالـ em. */
  letterSpacing: number;
  dir: "rtl" | "ltr" | "auto";
}

export interface TextEl extends Base {
  type: "text";
  text: string;
  font: FontSpec;
  vAlign: VAlign;
  /** مم. */
  padding: number;
  /** تصغير الخط ليتسع النص للمربع حتى حدّ أدنى (للأسماء الطويلة) بدل قصّه. */
  autoFit: { enabled: boolean; min: number };
  background?: string | null;
}

export interface ImageEl extends Base {
  type: "image";
  src: string;
  fit: ImageFit;
  /** قصّ بنسب من الصورة (0..1). */
  crop?: { x: number; y: number; w: number; h: number } | null;
  radius: number;
  /** صورة مطلوبة: التحقق يمنع الإصدار إن لم تُحلّ (شعار أو توقيع إلزامي). */
  required?: boolean;
}

export type ShapeKind = "rect" | "roundRect" | "ellipse";
export interface ShapeEl extends Base {
  type: "shape";
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
}

export interface LineEl extends Base {
  type: "line";
  stroke: string;
  strokeWidth: number;
  dash: "solid" | "dashed" | "dotted";
}

export type FrameKind = "classic" | "double" | "islamic" | "royal" | "minimal" | "corners" | "gold";
export interface FrameEl extends Base {
  type: "frame";
  frame: FrameKind;
  color: string;
  color2: string;
  thickness: number;
}

export type OrnamentKind =
  | "rosette"
  | "star8"
  | "medallion"
  | "divider"
  | "corner"
  | "arch"
  | "laurel"
  | "book"
  | "seal"
  | "crescentStar";
export interface OrnamentEl extends Base {
  type: "ornament";
  ornament: OrnamentKind;
  color: string;
  color2: string;
}

export interface QrEl extends Base {
  type: "qr";
  color: string;
  background: string;
}

export interface SignatureEl extends Base {
  type: "signature";
  /** صورة التوقيع (أصل أو brand:signature:<role>)، اختيارية. */
  src?: string | null;
  role: "signature";
  /** صفة الموقّع (معلّم الحلقة، المشرف، مدير المركز). */
  label: string;
  /** اسم الموقّع، يقبل المتغيّرات مثل {{teacher.name}}. */
  signer: string;
  font: FontSpec;
  showLine: boolean;
  lineColor: string;
  required?: boolean;
}

export type CertElement =
  TextEl | ImageEl | ShapeEl | LineEl | FrameEl | OrnamentEl | QrEl | SignatureEl;
export type ElementType = CertElement["type"];

/** عرض الأرقام والتواريخ في الشهادة (أرقام عربية أو لاتينية، ميلادي أو هجري أو كلاهما). */
export interface NumberStyleSpec {
  digits: "arab" | "latn";
  calendar: "gregorian" | "hijri" | "both";
}
export const DEFAULT_NUMBERS: NumberStyleSpec = { digits: "arab", calendar: "gregorian" };

export interface Design {
  v: number;
  page: PageSpec;
  palette: Palette;
  numbers: NumberStyleSpec;
  elements: CertElement[];
}

/** مُعرّف قصير ثابت الشكل للعناصر والمجموعات. */
export function newId(prefix = "e"): string {
  const r =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${r}`;
}

export function pageDims(size: PageSizeKey, orientation: Orientation, custom?: [number, number]) {
  const [w, h] = size === "custom" ? (custom ?? [210, 297]) : PAGE_SIZES[size];
  const [a, b] = [Math.min(w, h), Math.max(w, h)];
  return orientation === "landscape" ? { width: b, height: a } : { width: a, height: b };
}

export function defaultPage(
  size: PageSizeKey = "A4",
  orientation: Orientation = "landscape",
): PageSpec {
  return {
    size,
    orientation,
    ...pageDims(size, orientation),
    bleed: 3,
    safe: 8,
    background: "$paper",
    backgroundImage: null,
    pattern: null,
  };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const round2 = (v: number) => Math.round(v * 100) / 100;

/** يحلّ رمز لوحة إلى لون (`$primary` ← لون المركز الأساسي). القيم الأخرى كما هي بعد تعقيمها. */
export function color(value: string | null | undefined, p: Palette): string {
  if (!value) return "transparent";
  if (value.startsWith("$")) {
    const k = value.slice(1) as keyof Palette;
    return p[k] ?? "transparent";
  }
  return safeColor(value);
}

/** يقبل ألوان CSS البسيطة فقط (لا url() ولا تعبيرات) لأن القيمة تدخل نص CSS. */
export function safeColor(v: string): string {
  const s = v.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
  if (/^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)$/i.test(s)) return s;
  if (s === "transparent" || s === "white" || s === "black") return s;
  return "transparent";
}

/** لوحة بألوان صالحة فقط؛ غير الصالح يعود للافتراضي. */
export function safePalette(p: Partial<Palette> | undefined): Palette {
  const out = { ...DEFAULT_PALETTE };
  for (const k of Object.keys(out) as (keyof Palette)[]) {
    const v = p?.[k];
    if (typeof v === "string" && safeColor(v) !== "transparent") out[k] = v.trim();
  }
  return out;
}

export function defaultFont(over: Partial<FontSpec> = {}): FontSpec {
  return {
    weight: 400,
    size: 14,
    color: "$ink",
    align: "center",
    lineHeight: 1.6,
    letterSpacing: 0,
    dir: "rtl",
    ...over,
    // خط واحد مسموح: التصاميم المحفوظة قبل 1.30.0 تحمل "Thmanyah" فتُرحَّل هنا عند القراءة.
    family: FONT_FAMILY,
  };
}

const base = (over: Partial<Base>): Base => ({
  id: newId(),
  x: 20,
  y: 20,
  w: 80,
  h: 20,
  rotation: 0,
  opacity: 1,
  ...over,
});

/** مصانع العناصر لأدوات المصمم. */
export const make = {
  text: (over: Partial<TextEl> = {}): TextEl => ({
    ...base(over),
    type: "text",
    text: over.text ?? "",
    font: defaultFont(over.font),
    vAlign: "middle",
    padding: 0,
    autoFit: { enabled: false, min: 8 },
    background: null,
    ...stripBase(over),
  }),
  image: (over: Partial<ImageEl> = {}): ImageEl => ({
    ...base({ w: 30, h: 30, ...over }),
    type: "image",
    src: "",
    fit: "contain",
    crop: null,
    radius: 0,
    ...stripBase(over),
  }),
  shape: (over: Partial<ShapeEl> = {}): ShapeEl => ({
    ...base({ w: 60, h: 30, ...over }),
    type: "shape",
    shape: "rect",
    fill: "transparent",
    stroke: "$accent",
    strokeWidth: 0.5,
    radius: 0,
    ...stripBase(over),
  }),
  line: (over: Partial<LineEl> = {}): LineEl => ({
    ...base({ w: 80, h: 2, ...over }),
    type: "line",
    stroke: "$accent",
    strokeWidth: 0.4,
    dash: "solid",
    ...stripBase(over),
  }),
  frame: (over: Partial<FrameEl> = {}): FrameEl => ({
    ...base({ x: 8, y: 8, w: 100, h: 100, ...over }),
    type: "frame",
    frame: "classic",
    color: "$primary",
    color2: "$accent",
    thickness: 1,
    ...stripBase(over),
  }),
  ornament: (over: Partial<OrnamentEl> = {}): OrnamentEl => ({
    ...base({ w: 24, h: 24, ...over }),
    type: "ornament",
    ornament: "rosette",
    color: "$accent",
    color2: "$primary",
    ...stripBase(over),
  }),
  qr: (over: Partial<QrEl> = {}): QrEl => ({
    ...base({ w: 22, h: 22, ...over }),
    type: "qr",
    role: "qr",
    color: "$ink",
    background: "#ffffff",
    ...stripBase(over),
  }),
  signature: (over: Partial<SignatureEl> = {}): SignatureEl => ({
    ...base({ w: 50, h: 26, ...over }),
    type: "signature",
    role: "signature",
    src: null,
    label: "",
    signer: "",
    font: defaultFont({ size: 10, ...over.font }),
    showLine: true,
    lineColor: "$accent",
    ...stripBase(over),
  }),
};

function stripBase<T extends object>(o: T): Partial<T> {
  const c = { ...o } as Record<string, unknown>;
  delete c.font;
  return c as Partial<T>;
}

export const isTextual = (e: CertElement): e is TextEl | SignatureEl =>
  e.type === "text" || e.type === "signature";

/** مراجع الصور في التصميم (لجلب بياناتها مرة واحدة). */
export function imageRefs(d: Design): string[] {
  const out = new Set<string>();
  if (d.page.backgroundImage) out.add(d.page.backgroundImage);
  for (const e of d.elements) {
    if (e.type === "image" && e.src) out.add(e.src);
    if (e.type === "signature" && e.src) out.add(e.src);
  }
  return [...out];
}

export const assetIdOf = (ref: string | null | undefined) =>
  ref && ref.startsWith("asset:") ? ref.slice(6) : null;

/** نسخة عميقة آمنة (التصميم JSON خالص). */
export const cloneDesign = <T>(d: T): T => JSON.parse(JSON.stringify(d)) as T;

/**
 * القيم التي تدخل سمات HTML وCSS (ألوان، اتجاهات، أنواع، مراجع، معرّفات) محارف آمنة فقط؛ النصوص الحرة
 * (النص والاسم والصفة والموقّع) تُهرَّب عند الرسم. المطابق في الخادم: private.cert_design_ok (1.22.0).
 */
export const SAFE_DESIGN_VALUE = /^[A-Za-z0-9_$#:.,()%\s-]{0,120}$/;
const FREE_TEXT_KEYS = new Set(["text", "name", "label", "signer"]);

/** يحذف كل قيمة نصية غير آمنة (فتأخذ الافتراضي) — دفاع ضد تصميم مُعدّ يُرسل للخادم مباشرة. */
export function scrubDesign(raw: unknown, free = false): unknown {
  if (typeof raw === "string") return free || SAFE_DESIGN_VALUE.test(raw) ? raw : undefined;
  if (Array.isArray(raw)) return raw.map((x) => scrubDesign(x)).filter((x) => x !== undefined);
  if (raw && typeof raw === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!/^[A-Za-z][A-Za-z0-9]{0,30}$/.test(k)) continue;
      const c = scrubDesign(v, FREE_TEXT_KEYS.has(k) && typeof v === "string");
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return typeof raw === "number" ? (Number.isFinite(raw) ? raw : undefined) : raw;
}

/** يطبّع تصميماً قادماً من الخادم أو من قالب قديم: يضمن الحقول ويحذف الأنواع غير المعروفة. */
export function normalizeDesign(raw: unknown): Design {
  const s = scrubDesign(raw);
  const d = (s && typeof s === "object" ? s : {}) as Partial<Design>;
  const page = { ...defaultPage(), ...(d.page ?? {}) } as PageSpec;
  page.width = clamp(Number(page.width) || 297, MIN_PAGE_MM, MAX_PAGE_MM);
  page.height = clamp(Number(page.height) || 210, MIN_PAGE_MM, MAX_PAGE_MM);
  const known: ElementType[] = [
    "text",
    "image",
    "shape",
    "line",
    "frame",
    "ornament",
    "qr",
    "signature",
  ];
  const elements = (Array.isArray(d.elements) ? d.elements : [])
    .filter((e): e is CertElement => !!e && known.includes((e as CertElement).type))
    .map((e) => {
      const f = make[e.type] as (o: Partial<CertElement>) => CertElement;
      const n = f(e as never);
      if (isTextual(n)) n.font = defaultFont((e as TextEl).font);
      return n;
    });
  return {
    v: DESIGN_VERSION,
    page,
    palette: safePalette(d.palette),
    numbers: { ...DEFAULT_NUMBERS, ...(d.numbers ?? {}) },
    elements,
  };
}
