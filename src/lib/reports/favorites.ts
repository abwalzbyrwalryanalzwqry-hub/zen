/**
 * اختصارات التقارير (1.15.0): «كرر آخر تقرير» وحتى 3 تقارير مفضلة مسمّاة لكل حلقة، على الجهاز.
 * المفضل يحفظ «ماذا يُطبع» (النوع والفترة والطلاب والتصفية والأقسام والشكل) لا الهوية، فهي للمركز.
 * الفترة الجاهزة («هذا الشهر») تُعاد حسابها بتاريخ اليوم، والمخصصة تبقى بتاريخيها.
 */
import { migrateConfig, presetRange, type ReportConfig } from "./config";

export const MAX_FAVORITES = 3;

const SHAPE = [
  "kind",
  "preset",
  "from",
  "to",
  "weekdays",
  "students",
  "activeOnly",
  "status",
  "grade",
  "achievement",
  "records",
  "sort",
  "template",
  "title",
  "subtitle",
  "orientation",
  "compare",
] as const;
export type ReportShape = Pick<ReportConfig, (typeof SHAPE)[number]>;

export interface Favorite {
  id: string;
  name: string;
  shape: ReportShape;
}
export interface LastReport {
  at: string;
  shape: ReportShape;
}

export function shapeOf(c: ReportConfig): ReportShape {
  const out = {} as Record<string, unknown>;
  for (const k of SHAPE) out[k] = c[k];
  return out as ReportShape;
}

/** يطبّق تقريراً محفوظاً على الإعدادات الحالية (بالتحقق نفسه لإعدادات الجهاز). */
export function applyShape(
  c: ReportConfig,
  shape: Partial<ReportShape>,
  today: string,
): ReportConfig {
  const picked: Partial<ReportConfig> = {};
  for (const k of SHAPE) if (k in shape) (picked as Record<string, unknown>)[k] = shape[k];
  const merged = migrateConfig({ ...c, ...picked }, c);
  const r = presetRange(merged.preset, today);
  return r ? { ...merged, ...r } : merged;
}

const FAV_KEY = (h: string) => `zen-report-favorites:${h}`;
const LAST_KEY = (h: string) => `zen-report-last:${h}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* التخزين غير متاح */
  }
}

export function loadFavorites(halaqa: string): Favorite[] {
  const list = read<unknown>(FAV_KEY(halaqa), []);
  return Array.isArray(list)
    ? (list as Favorite[])
        .filter((f) => f && typeof f.name === "string" && f.shape && typeof f.shape === "object")
        .slice(0, MAX_FAVORITES)
    : [];
}

/** يضيف مفضلاً (أو يستبدل ما يحمل الاسم نفسه)؛ لا أكثر من ثلاثة. */
export function addFavorite(halaqa: string, name: string, c: ReportConfig): Favorite[] {
  const clean = name.trim().slice(0, 30);
  if (!clean) return loadFavorites(halaqa);
  const rest = loadFavorites(halaqa).filter((f) => f.name !== clean);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const fav: Favorite = { id, name: clean, shape: shapeOf(c) };
  const next = [...rest, fav].slice(-MAX_FAVORITES);
  write(FAV_KEY(halaqa), next);
  return next;
}

export function removeFavorite(halaqa: string, id: string): Favorite[] {
  const next = loadFavorites(halaqa).filter((f) => f.id !== id);
  write(FAV_KEY(halaqa), next);
  return next;
}

export function loadLast(halaqa: string): LastReport | null {
  const v = read<LastReport | null>(LAST_KEY(halaqa), null);
  return v && v.shape && typeof v.shape === "object" ? v : null;
}

/** يُسجَّل بعد كل تصدير ناجح (PDF أو Excel أو مشاركة أو طباعة). */
export function markLast(halaqa: string, c: ReportConfig) {
  write(LAST_KEY(halaqa), { at: new Date().toISOString(), shape: shapeOf(c) });
}
