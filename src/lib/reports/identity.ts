/**
 * هوية التقرير (1.15.0): ما يُضبط مرة واحدة للمركز — الألوان والشعار والترويسة والتذييل والتقويم والأرقام.
 * تُحفظ على الخادم في centers.report_identity (report_identity / set_report_identity)، وعلى الجهاز ضمن
 * إعدادات الحلقة احتياطاً: إن لم تتوفر الدالة أو لم يكن المستخدم من طاقم المركز يبقى التعديل محلياً.
 */
import { rpc } from "@/integrations/supabase/rpc";
import type { Json } from "@/integrations/supabase/types";
import { DEFAULT_COLORS, mix, type ReportColors, type ReportConfig } from "./config";

export type Identity = Pick<
  ReportConfig,
  "header" | "logo" | "footer" | "colors" | "digits" | "calendar"
>;

export function identityOf(c: ReportConfig): Identity {
  return {
    header: c.header,
    logo: c.logo,
    footer: c.footer,
    colors: c.colors,
    digits: c.digits,
    calendar: c.calendar,
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T =>
  list.includes(v as T) ? (v as T) : d;
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const str = (v: unknown, d: string, max: number) => (typeof v === "string" ? v.slice(0, max) : d);

/** يدمج هوية محفوظة (من الخادم أو غيره) في الإعدادات بعد التحقق من كل حقل؛ غير الصالح يبقى كما هو. */
export function applyIdentity(c: ReportConfig, raw: unknown): ReportConfig {
  const r = obj(raw);
  if (!Object.keys(r).length) return c;
  const h = obj(r.header);
  const l = obj(r.logo);
  const f = obj(r.footer);
  const col = obj(r.colors);
  const sizes = ["sm", "md", "lg"] as const;
  const aligns = ["start", "center", "end"] as const;
  const colors = { ...c.colors };
  for (const k of Object.keys(DEFAULT_COLORS) as (keyof ReportColors)[])
    if (typeof col[k] === "string" && HEX.test(col[k] as string)) colors[k] = col[k] as string;
  const dataUrl =
    typeof l.dataUrl === "string" && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(l.dataUrl)
      ? l.dataUrl
      : l.dataUrl === null
        ? null
        : c.logo.dataUrl;
  return {
    ...c,
    header: {
      show: bool(h.show, c.header.show),
      text: str(h.text, c.header.text, 80),
      size: oneOf(h.size, sizes, c.header.size),
      weight: oneOf(h.weight, ["regular", "medium", "black"] as const, c.header.weight),
      align: oneOf(h.align, aligns, c.header.align),
    },
    logo: {
      mode: oneOf(l.mode, ["app", "custom", "none"] as const, c.logo.mode),
      dataUrl,
      size: oneOf(l.size, sizes, c.logo.size),
      align: oneOf(l.align, aligns, c.logo.align),
    },
    footer: {
      show: bool(f.show, c.footer.show),
      text: str(f.text, c.footer.text, 120),
      pageNumbers: bool(f.pageNumbers, c.footer.pageNumbers),
      pageTotal: bool(f.pageTotal, c.footer.pageTotal),
    },
    colors,
    digits: oneOf(r.digits, ["arab", "latn"] as const, c.digits),
    calendar: oneOf(r.calendar, ["gregorian", "hijri", "both"] as const, c.calendar),
  };
}

export const sameIdentity = (a: Identity, b: Identity) => JSON.stringify(a) === JSON.stringify(b);

/* ─────────── الألوان الجاهزة ─────────── */

/** لوحة كاملة من لون واحد: رأس الجدول والعناوين به، والصفوف المتناوبة والحدود فاتحة منه. */
export function paletteFrom(primary: string): ReportColors {
  return {
    primary,
    headerBg: primary,
    headerText: "#ffffff",
    text: DEFAULT_COLORS.text,
    heading: primary,
    border: mix(primary, 0.78),
    zebra: mix(primary, 0.94),
  };
}

export const COLOR_PRESETS = [
  { id: "zen", colors: { ...DEFAULT_COLORS } },
  { id: "navy", colors: paletteFrom("#1f3a68") },
  { id: "maroon", colors: paletteFrom("#7a1f2b") },
  { id: "brown", colors: paletteFrom("#6b4a1f") },
  { id: "purple", colors: paletteFrom("#4b2e83") },
  { id: "gray", colors: paletteFrom("#3d4650") },
] as const;
export type PresetId = (typeof COLOR_PRESETS)[number]["id"];

/** اللوحة الجاهزة المطابقة للألوان الحالية، أو null إن كانت مخصصة. */
export function presetOf(c: ReportColors): PresetId | null {
  const k = (x: ReportColors) => JSON.stringify(Object.entries(x).sort()).toLowerCase();
  return COLOR_PRESETS.find((p) => k(p.colors) === k(c))?.id ?? null;
}

/* ─────────── الخادم ─────────── */

export interface ServerIdentity {
  identity: unknown;
  canEdit: boolean;
}

/** null = الدالة غير متاحة (خادم أقدم) أو لا صلاحية: يبقى الحفظ على الجهاز وحده. */
export async function fetchIdentity(halaqa: string): Promise<ServerIdentity | null> {
  const { data, error } = await rpc("report_identity", { _halaqa: halaqa });
  if (error || !data) return null;
  const d = obj(data);
  return { identity: d.identity ?? null, canEdit: d.can_edit === true };
}

export async function saveIdentity(halaqa: string, id: Identity): Promise<boolean> {
  const { error } = await rpc("set_report_identity", {
    _halaqa: halaqa,
    _identity: id as unknown as Json,
  });
  return !error;
}
