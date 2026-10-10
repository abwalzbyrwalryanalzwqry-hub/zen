// ============================================================
// Zen — Quran Module
// Phase 8.6.1 — Reading preferences (persisted locally)
// ============================================================

import { useCallback, useSyncExternalStore } from "react";

const KEY = "zen.quran.reading-prefs.v1";
const EVENT = "zen:reading-prefs";

export type FontSizeKey = "sm" | "md" | "lg" | "xl";
export type LineHeightKey = "compact" | "normal" | "relaxed";
export type WidthKey = "narrow" | "normal" | "wide";
export type QuranFontKey = "amiri" | "scheherazade" | "naskh";
/** لون ورق القراءة: كسمة التطبيق، أو سيبيا دافئ، أو ليلي مريح للعين، أو أسود لشاشات OLED. */
export type PaperKey = "auto" | "sepia" | "night" | "black";

export interface ReadingPrefs {
  fontSize: FontSizeKey;
  lineHeight: LineHeightKey;
  width: WidthKey;
  font: QuranFontKey;
  /** إبقاء الشاشة مضاءة أثناء القراءة والتلاوة. */
  keepAwake: boolean;
  paper: PaperKey;
  /** تكبير صفحة المصحف (١ = عرض الشاشة، حتى ٢). */
  mushafZoom: number;
}

export const DEFAULT_PREFS: ReadingPrefs = {
  fontSize: "md",
  lineHeight: "normal",
  width: "normal",
  font: "amiri",
  keepAwake: true,
  paper: "auto",
  mushafZoom: 1,
};

/** درجات تكبير صفحة المصحف (أزرار التكبير والتصغير؛ القرص يتوقف عند أقربها). */
export const MUSHAF_ZOOM_STEPS = [1, 1.15, 1.3, 1.5, 1.75, 2] as const;

export function clampZoom(z: unknown): number {
  const n = typeof z === "number" && Number.isFinite(z) ? z : 1;
  return Math.min(2, Math.max(1, Math.round(n * 100) / 100));
}

export const PAPER_OPTIONS: { key: PaperKey; label: string }[] = [
  { key: "auto", label: "حسب سمة التطبيق" },
  { key: "sepia", label: "سيبيا" },
  { key: "night", label: "ليلي" },
  { key: "black", label: "أسود (OLED)" },
];

/** صنف CSS يعيد تعريف ألوان القارئ (انظر `.reading-paper-*` في styles.css). */
export function paperClass(paper: PaperKey): string {
  return paper === "auto" ? "" : `reading-paper-${paper}`;
}

export const FONT_SIZE_OPTIONS: { key: FontSizeKey; label: string; px: number }[] = [
  { key: "sm", label: "صغير", px: 22 },
  { key: "md", label: "متوسط", px: 26 },
  { key: "lg", label: "كبير", px: 31 },
  { key: "xl", label: "كبير جدًا", px: 37 },
];

export const LINE_HEIGHT_OPTIONS: {
  key: LineHeightKey;
  label: string;
  value: number;
}[] = [
  { key: "compact", label: "متقارب", value: 2.05 },
  { key: "normal", label: "مريح", value: 2.45 },
  { key: "relaxed", label: "واسع", value: 2.9 },
];

export const WIDTH_OPTIONS: { key: WidthKey; label: string; ch: string }[] = [
  { key: "narrow", label: "ضيّق", ch: "26rem" },
  { key: "normal", label: "معتاد", ch: "32rem" },
  { key: "wide", label: "عريض", ch: "100%" },
];

export const QURAN_FONT_OPTIONS: {
  key: QuranFontKey;
  label: string;
  stack: string;
}[] = [
  { key: "amiri", label: "أميري قرآن", stack: '"Amiri Quran", "Scheherazade New", serif' },
  {
    key: "scheherazade",
    label: "شهرزاد",
    stack: '"Scheherazade New", "Amiri Quran", serif',
  },
  {
    key: "naskh",
    label: "نسخ",
    stack: '"Noto Naskh Arabic", "Scheherazade New", serif',
  },
];

/** Resolved CSS values for the current preferences. */
export interface ResolvedReadingStyle {
  fontSizePx: number;
  /** الحجم نفسه بوحدة rem: يكبر مع حجم خط النظام (إمكانية الوصول). */
  fontSizeRem: number;
  lineHeight: number;
  maxWidth: string;
  fontFamily: string;
}

export function resolveReadingStyle(p: ReadingPrefs): ResolvedReadingStyle {
  const size = FONT_SIZE_OPTIONS.find((o) => o.key === p.fontSize) ?? FONT_SIZE_OPTIONS[1];
  const lh = LINE_HEIGHT_OPTIONS.find((o) => o.key === p.lineHeight) ?? LINE_HEIGHT_OPTIONS[1];
  const w = WIDTH_OPTIONS.find((o) => o.key === p.width) ?? WIDTH_OPTIONS[1];
  const f = QURAN_FONT_OPTIONS.find((o) => o.key === p.font) ?? QURAN_FONT_OPTIONS[0];
  return {
    fontSizePx: size.px,
    fontSizeRem: size.px / 16,
    lineHeight: lh.value,
    maxWidth: w.ch,
    fontFamily: f.stack,
  };
}

function read(): ReadingPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const merged = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ReadingPrefs>) };
    return { ...merged, mushafZoom: clampZoom(merged.mushafZoom) };
  } catch {
    return DEFAULT_PREFS;
  }
}

// مصدر واحد في الذاكرة يُقرأ من التخزين أول مرة، فتبقى هوية اللقطة ثابتة لـ useSyncExternalStore (M12)
// ويظل التعديل ظاهراً حتى لو فشل الحفظ (حصة أو خصوصية).
let current: ReadingPrefs | null = null;
const snapshot = () => (current ??= read());
const subscribe = (cb: () => void) => {
  const fromStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== KEY) return;
    current = read();
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", fromStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", fromStorage);
  };
};
function publish(next: ReadingPrefs | null) {
  current = next;
  try {
    if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* ignore quota / privacy errors */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Reactive, cross-component reading preferences. */
export function useReadingPrefs() {
  const prefs = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_PREFS);

  const update = useCallback((patch: Partial<ReadingPrefs>) => {
    publish({ ...snapshot(), ...patch });
  }, []);

  const reset = useCallback(() => {
    publish(null);
    current = DEFAULT_PREFS;
  }, []);

  return { prefs, update, reset, style: resolveReadingStyle(prefs) } as const;
}
