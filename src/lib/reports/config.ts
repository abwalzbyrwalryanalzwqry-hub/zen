/**
 * إعدادات التقرير: النوع والنطاق والتصفية والشكل. الإعدادات تؤثر في الملف الناتج وحده ولا تمسّ بيانات
 * السجل اليومي. آخر إعدادات لكل حلقة تُحفظ على الجهاز (localStorage) ليجدها المعلّم عند العودة.
 */
import type { SortMode, StudentStatusFilter, GradeFilter, AchievementFilter } from "./calc";
import type { CalendarMode, Digits } from "./format";
import { addDays, daysBetween, monthStart, weekStart } from "@/lib/muhasaba/dates";
import { safeFileName } from "@/lib/native-file";

/**
 * أربعة أنواع فقط (1.15.0). الأنواع القديمة كانت نطاقات زمنية (اليومي والشهري والتراكمي) أو تقرير الحلقة
 * بأقسام أقل (الحفظ والمراجعة والشامل)، فصارت شرائح نطاق وأقسام. `migrateConfig` يحوّل المحفوظ منها.
 */
export const REPORT_KINDS = ["halaqa", "student", "attendance", "achievement"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const LEGACY_KINDS = [
  "memorize",
  "review",
  "cumulative",
  "daily",
  "monthly",
  "comprehensive",
] as const;
type LegacyKind = (typeof LEGACY_KINDS)[number];

export const RECORD_TYPES = [
  "attendance",
  "memorize",
  "review",
  "evaluation",
  "notes",
  "achievement",
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const RANGE_PRESETS = [
  "today",
  "week",
  "month",
  "lastMonth",
  "last30",
  "last90",
  "custom",
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const TEMPLATES = ["official", "brief", "detailed"] as const;
export type Template = (typeof TEMPLATES)[number];

export type Align = "start" | "center" | "end";
export type Size = "sm" | "md" | "lg";

export interface ReportColors {
  primary: string;
  headerBg: string;
  headerText: string;
  text: string;
  border: string;
  zebra: string;
  heading: string;
}

export interface ReportConfig {
  kind: ReportKind;
  preset: RangePreset;
  from: string;
  to: string;
  /** أيام الأسبوع (0 = الأحد) من مواعيد الحلقة؛ null = كل الأيام. */
  weekdays: number[] | null;
  /** null = جميع الطلاب. */
  students: string[] | null;
  activeOnly: boolean;
  status: StudentStatusFilter;
  grade: GradeFilter;
  achievement: AchievementFilter;
  records: RecordType[];
  sort: SortMode;
  template: Template;
  title: string;
  subtitle: string;
  header: {
    show: boolean;
    text: string;
    size: Size;
    weight: "regular" | "medium" | "black";
    align: Align;
  };
  logo: { mode: "app" | "custom" | "none"; dataUrl: string | null; size: Size; align: Align };
  footer: { show: boolean; text: string; pageNumbers: boolean; pageTotal: boolean };
  colors: ReportColors;
  digits: Digits;
  calendar: CalendarMode;
  orientation: "auto" | "portrait" | "landscape";
  compare: boolean;
}

/** الألوان الافتراضية: أخضر زِن الرسمي، وتباين مناسب للطباعة. */
export const DEFAULT_COLORS: ReportColors = {
  primary: "#0f5f57",
  headerBg: "#0f5f57",
  headerText: "#ffffff",
  text: "#1c2a26",
  border: "#cfdcd8",
  zebra: "#f3f8f6",
  heading: "#0f5f57",
};

/** الأقسام الافتراضية لكل نوع؛ تظهر شرائح قابلة للإيقاف تحت النوع. */
export const KIND_RECORDS: Record<ReportKind, RecordType[]> = {
  halaqa: ["attendance", "memorize", "review", "evaluation", "achievement"],
  student: ["attendance", "memorize", "review", "evaluation", "notes", "achievement"],
  attendance: ["attendance"],
  achievement: ["achievement", "memorize", "attendance"],
};

/** الأقسام المتاحة لكل نوع (ما لا معنى له في النوع لا يظهر). */
export const KIND_SECTIONS: Record<ReportKind, RecordType[]> = {
  halaqa: [...RECORD_TYPES],
  student: [...RECORD_TYPES],
  attendance: ["attendance", "notes"],
  achievement: ["achievement", "memorize", "review", "attendance"],
};

const LEGACY: Record<LegacyKind, { records: RecordType[]; preset?: RangePreset }> = {
  memorize: { records: ["memorize"] },
  review: { records: ["review"] },
  cumulative: { records: ["attendance", "memorize", "review", "achievement"], preset: "last90" },
  daily: { records: ["attendance", "memorize", "review", "evaluation", "notes"], preset: "today" },
  monthly: { records: ["attendance", "memorize", "review", "evaluation"], preset: "month" },
  comprehensive: { records: [...RECORD_TYPES] },
};

export function presetRange(p: RangePreset, today: string): { from: string; to: string } | null {
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "week":
      return { from: weekStart(today), to: today };
    case "month":
      return { from: monthStart(today), to: today };
    case "lastMonth": {
      const end = addDays(monthStart(today), -1);
      return { from: monthStart(end), to: end };
    }
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "last90":
      return { from: addDays(today, -89), to: today };
    default:
      return null;
  }
}

export function defaultConfig(today: string, title = ""): ReportConfig {
  const r = presetRange("month", today)!;
  return {
    kind: "halaqa",
    preset: "month",
    ...r,
    weekdays: null,
    students: null,
    activeOnly: true,
    status: "all",
    grade: "all",
    achievement: "all",
    records: [...KIND_RECORDS.halaqa],
    sort: "circle",
    template: "official",
    title,
    subtitle: "",
    header: { show: true, text: "", size: "md", weight: "black", align: "center" },
    logo: { mode: "app", dataUrl: null, size: "md", align: "center" },
    footer: { show: true, text: "", pageNumbers: true, pageTotal: true },
    colors: { ...DEFAULT_COLORS },
    digits: "arab",
    calendar: "gregorian",
    orientation: "auto",
    compare: true,
  };
}

/** القوالب تضبط الكثافة والترويسة دون أن تمسّ اختيار البيانات. */
export function applyTemplate(c: ReportConfig, t: Template): ReportConfig {
  if (t === "brief")
    return {
      ...c,
      template: t,
      header: { ...c.header, size: "sm" },
      logo: { ...c.logo, size: "sm" },
      compare: false,
    };
  if (t === "detailed")
    return {
      ...c,
      template: t,
      header: { ...c.header, size: "lg" },
      logo: { ...c.logo, size: "lg" },
      compare: true,
    };
  return {
    ...c,
    template: t,
    header: { ...c.header, size: "md" },
    logo: { ...c.logo, size: "md" },
  };
}

/* ─────────── التباين ─────────── */

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (c: [number, number, number]) =>
  `#${c
    .map((x) =>
      Math.round(Math.max(0, Math.min(255, x)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

export function luminance(hex: string): number {
  const c = rgb(hex);
  if (!c) return 0;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** يخلط اللون بالأسود (t<0) أو الأبيض (t>0). */
export function mix(hex: string, t: number): string {
  const c = rgb(hex) ?? [0, 0, 0];
  const target = t < 0 ? 0 : 255;
  const k = Math.abs(t);
  return toHex(c.map((v) => v + (target - v) * k) as [number, number, number]);
}

/** أقرب لون يحقق التباين المطلوب مع الخلفية، بتغميقه أو تفتيحه تدريجياً. */
export function ensureContrast(fg: string, bg: string, min: number): string {
  if (!rgb(fg)) return fg;
  if (contrast(fg, bg) >= min) return fg;
  const darker = luminance(bg) > 0.4;
  for (let k = 0.1; k <= 1.0001; k += 0.1) {
    const c = mix(fg, darker ? -k : k);
    if (contrast(c, bg) >= min) return c;
  }
  return darker ? "#000000" : "#ffffff";
}

export type ColorKey = keyof ReportColors;
export interface ColorFix {
  key: ColorKey;
  from: string;
  to: string;
}

/**
 * يمنع التركيبات غير المقروءة ويقترح الأوضح: النص والعناوين على الأبيض (4.5 فأكثر)، ونص رأس الجدول على
 * خلفيته (4.5)، والصفوف المتناوبة فاتحة جداً (للطباعة)، والحدود خفيفة لكن مرئية.
 */
export function readableColors(c: ReportColors): { colors: ReportColors; fixes: ColorFix[] } {
  const out: ReportColors = { ...DEFAULT_COLORS, ...c };
  for (const k of Object.keys(out) as ColorKey[]) if (!rgb(out[k])) out[k] = DEFAULT_COLORS[k];
  const fixes: ColorFix[] = [];
  const set = (key: ColorKey, to: string) => {
    if (to.toLowerCase() !== out[key].toLowerCase()) {
      fixes.push({ key, from: out[key], to });
      out[key] = to;
    }
  };
  set("text", ensureContrast(out.text, "#ffffff", 7));
  set("heading", ensureContrast(out.heading, "#ffffff", 4.5));
  set("primary", ensureContrast(out.primary, "#ffffff", 3));
  set("headerText", ensureContrast(out.headerText, out.headerBg, 4.5));
  if (luminance(out.zebra) < 0.82) {
    let z = out.zebra;
    for (let k = 0.1; luminance(z) < 0.82 && k <= 1; k += 0.1) z = mix(out.zebra, k);
    set("zebra", z);
  }
  if (contrast(out.border, "#ffffff") > 3.2) set("border", mix(out.border, 0.6));
  if (contrast(out.border, "#ffffff") < 1.15) set("border", DEFAULT_COLORS.border);
  return { colors: out, fixes };
}

/* ─────────── الحفظ على الجهاز ─────────── */

const KEY = (halaqa: string) => `zen-report-config:${halaqa}`;

/**
 * يحوّل إعدادات محفوظة بأي إصدار سابق إلى الشكل الحالي: النوع القديم ← تقرير الحلقة بأقسامه ونطاقه،
 * وقالبا «طالب» و«حلقة» ← رسمي، والأقسام غير المتاحة للنوع تُحذف.
 */
export function migrateConfig(
  saved: Partial<Omit<ReportConfig, "kind" | "template">> & { kind?: string; template?: string },
  base: ReportConfig,
): ReportConfig {
  const { kind: rawKind, template: rawTemplate, ...rest } = saved;
  const merged: ReportConfig = {
    ...base,
    ...rest,
    header: { ...base.header, ...saved.header },
    logo: { ...base.logo, ...saved.logo },
    footer: { ...base.footer, ...saved.footer },
    colors: { ...base.colors, ...saved.colors },
  };
  const legacy = LEGACY[rawKind as LegacyKind];
  if (legacy) {
    merged.kind = "halaqa";
    merged.records = [...legacy.records];
    if (legacy.preset) merged.preset = legacy.preset;
  } else
    merged.kind = REPORT_KINDS.includes(rawKind as ReportKind)
      ? (rawKind as ReportKind)
      : base.kind;
  merged.template = TEMPLATES.includes(rawTemplate as Template)
    ? (rawTemplate as Template)
    : rawTemplate
      ? "official"
      : base.template;
  const allowed = KIND_SECTIONS[merged.kind];
  merged.records = (Array.isArray(merged.records) ? merged.records : []).filter((r) =>
    allowed.includes(r),
  );
  if (!merged.records.length) merged.records = [...KIND_RECORDS[merged.kind]];
  if (!RANGE_PRESETS.includes(merged.preset)) merged.preset = base.preset;
  return merged;
}

export function loadConfig(halaqa: string, today: string, title: string): ReportConfig {
  const base = defaultConfig(today, title);
  try {
    const raw = localStorage.getItem(KEY(halaqa));
    if (!raw) return base;
    const merged = migrateConfig(JSON.parse(raw) as Partial<ReportConfig>, base);
    // نطاق جاهز يُعاد حسابه بتاريخ اليوم (هذا الشهر يبقى «هذا الشهر»).
    const r = presetRange(merged.preset, today);
    if (r) Object.assign(merged, r);
    return merged;
  } catch {
    return base;
  }
}

export function saveConfig(halaqa: string, c: ReportConfig): void {
  try {
    localStorage.setItem(KEY(halaqa), JSON.stringify(c));
  } catch {
    // الشعار المرفوع كبير جداً أو التخزين ممتلئ: تُحفظ بقية الإعدادات بلاه.
    try {
      localStorage.setItem(
        KEY(halaqa),
        JSON.stringify({ ...c, logo: { ...c.logo, dataUrl: null } }),
      );
    } catch {
      /* التخزين غير متاح */
    }
  }
}

/**
 * اسم ملف عربي واضح (1.15.0): «تقرير الحلقة - حلقة الفجر - أكتوبر 2026». الشهر الكامل (أو الجاري حتى
 * اليوم) باسمه، واليوم الواحد بتاريخه، وغير ذلك «من - إلى». الأرقام لاتينية ليُرتَّب الملف صحيحاً.
 */
export function reportFileName(p: {
  title: string;
  subject: string;
  from: string;
  to: string;
}): string {
  const { from, to } = p;
  let period: string;
  if (from === to) period = from;
  else if (from === monthStart(from) && to.slice(0, 7) === from.slice(0, 7))
    period = new Intl.DateTimeFormat("ar-u-nu-latn", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${from}T00:00:00Z`));
  else period = `${from} إلى ${to}`;
  return safeFileName([p.title, p.subject, period].filter(Boolean).join(" - "));
}

/** أقصى نطاق يقبله الخادم (INVALID_RANGE بعده). */
export const MAX_RANGE_DAYS = 731;

export function rangeError(cfg: Pick<ReportConfig, "from" | "to">): "order" | "long" | null {
  if (!cfg.from || !cfg.to || cfg.from > cfg.to) return "order";
  return daysBetween(cfg.from, cfg.to) + 1 > MAX_RANGE_DAYS ? "long" : null;
}
