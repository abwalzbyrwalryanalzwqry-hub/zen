/**
 * آخر سبب استئذان لكل طالب (1.19.0): يُعرض أولاً في نافذة السبب فيكفي لمسة واحدة لمن يتكرّر عذره (مرض يمتد
 * أياماً، سفر). على الجهاز فقط، وبحد 400 طالب (الأقدم يُحذف).
 */
export const LAST_REASON_KEY = "zen-last-reason";
const MAX = 400;

type Store = Record<string, string>;

function read(): Store {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_REASON_KEY) ?? "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Store) : {};
  } catch {
    return {};
  }
}

export function lastReason(student: string): string | null {
  const v = read()[student];
  return typeof v === "string" && v.trim() ? v : null;
}

export function rememberReason(student: string, reason: string | null): void {
  const r = reason?.trim();
  if (!r) return;
  const s = read();
  delete s[student];
  s[student] = r.slice(0, 200);
  const keys = Object.keys(s);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX))) delete s[k];
  try {
    localStorage.setItem(LAST_REASON_KEY, JSON.stringify(s));
  } catch {
    /* التخزين غير متاح */
  }
}
