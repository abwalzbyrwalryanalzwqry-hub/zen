import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/integrations/supabase/rpc";

/**
 * مفاتيح الميزات (تدقيق أكتوبر 2026، المرحلة 4.2). تُخفي مدخل ميزة من الواجهة أو تطرحها لنسبة من الحسابات
 * دون إصدار جديد. القيم الافتراضية هنا حين لا يوجد صف في `feature_flags` أو تعذّر الجلب (دون اتصال).
 *
 * الفشل مغلق للميزات غير الأساسية (جاهزية المستودع العام، N-04): المساعد والرسوم والتسميع عن بُعد وتحليل التلاوة
 * الآلي مطفأة ما لم يفعّلها صاحب التطبيق، فلا تظهر لمستخدم جديد بلا اتصال. والخادم يفرض المفاتيح نفسها في دوال
 * الذكاء الاصطناعي (`private.feature_on`، بالقيم الافتراضية ذاتها — اختبار يقارن بينهما).
 * مسار تقاعد ميزة قليلة الاستعمال: docs/SUSTAINABILITY.md ← «مفاتيح الميزات».
 */
export const FEATURE_DEFAULTS = {
  stories: true,
  achievements: true,
  assistant: false,
  recite: true,
  /** تفريغ التلاوة آلياً وملاحظاتها والتسميع المباشر. مطفأ حتى اجتياز بوابة ai-eval/recitation. */
  recite_ai: false,
  certificates: true,
  fees: false,
  remote: false,
} as const;
// للمداخل التي في «المزيد» وحدها؛ ما في الشريط السفلي (الاختبارات، المحاسبة…) لا يُخفى بمفتاح نصف إخفاء.

export type FeatureKey = keyof typeof FEATURE_DEFAULTS;
export const FEATURE_KEYS = Object.keys(FEATURE_DEFAULTS) as FeatureKey[];

export type FlagRow = { key: string; enabled: boolean; rollout: number; note: string | null };
export type FlagMap = Partial<Record<FeatureKey, FlagRow>>;

const CACHE_KEY = "zen-feature-flags";

/** FNV-1a 32-bit: توزيع ثابت لكل (مفتاح، حساب) — الحساب نفسه يرى النتيجة نفسها دائماً. */
export function bucketOf(key: string, userId: string): number {
  let h = 0x811c9dc5;
  const s = `${key}:${userId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 100;
}

export function isFeatureOn(flags: FlagMap, key: FeatureKey, userId: string | null): boolean {
  const row = flags[key];
  if (!row) return FEATURE_DEFAULTS[key];
  if (!row.enabled) return false;
  const rollout = Math.max(0, Math.min(100, Math.round(row.rollout)));
  if (rollout >= 100) return true;
  if (rollout <= 0 || !userId) return false;
  return bucketOf(key, userId) < rollout;
}

export function toFlagMap(rows: FlagRow[]): FlagMap {
  const out: FlagMap = {};
  for (const r of rows)
    if ((FEATURE_KEYS as string[]).includes(r.key)) out[r.key as FeatureKey] = r;
  return out;
}

export function readCachedFlags(): FlagMap {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as FlagRow[] | null;
    return Array.isArray(v) ? toFlagMap(v) : {};
  } catch {
    return {};
  }
}

export async function fetchFeatureFlags(): Promise<FlagMap> {
  const { data, error } = await supabase
    .from("feature_flags")
    .select("key, enabled, rollout, note");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as FlagRow[];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(rows));
  } catch {
    /* التخزين معطّل */
  }
  return toFlagMap(rows);
}

/** لصاحب التطبيق وحده (الخادم يرفض غيره). */
export async function setFeatureFlag(
  key: FeatureKey,
  enabled: boolean,
  rollout: number,
  note?: string,
): Promise<void> {
  const { error } = await rpc("set_feature_flag", {
    _key: key,
    _enabled: enabled,
    _rollout: rollout,
    _note: note ?? undefined,
  });
  if (error) throw new Error(error.message);
}
