/**
 * الوضع المبسّط للمعلّم (1.19.0، المرحلة 3). المعلّم الجديد يحتاج في أسبوعه الأول: حلقته، والسجل اليومي،
 * ورمز الحضور، والمتعثّرين. الوضع المبسّط يُخفي من «المزيد» ومن الرئيسية ما سوى ذلك (الاستوديو، والاستيراد،
 * والاختبارات، والتحقق، وأدوات النفس الثانوية) دون أن يمنع شيئاً: الروابط المباشرة تعمل، والصلاحيات على الخادم.
 *
 * - «تلقائي» (الافتراضي): يتبع إعداد المركز `centers.teacher_simple_mode` (تفعّله إدارته لمعلّميها).
 * - «مفعّل» / «متوقف»: اختيار المعلّم على جهازه يعلو على إعداد المركز.
 */
import { useSyncExternalStore } from "react";

export type SimplePreference = "auto" | "on" | "off";
export const SIMPLE_KEY = "zen-simple-mode";
export const SIMPLE_PREFERENCES: readonly SimplePreference[] = ["auto", "on", "off"];

export function parseSimplePreference(v: string | null | undefined): SimplePreference {
  return v === "on" || v === "off" ? v : "auto";
}

export function resolveSimpleMode(pref: SimplePreference, centerDefault: boolean): boolean {
  if (pref === "on") return true;
  if (pref === "off") return false;
  return centerDefault;
}

const listeners = new Set<() => void>();

export function getSimplePreference(): SimplePreference {
  try {
    return parseSimplePreference(localStorage.getItem(SIMPLE_KEY));
  } catch {
    return "auto";
  }
}

export function setSimplePreference(p: SimplePreference): void {
  try {
    if (p === "auto") localStorage.removeItem(SIMPLE_KEY);
    else localStorage.setItem(SIMPLE_KEY, p);
  } catch {
    /* التخزين غير متاح: يبقى الاختيار لهذه الجلسة فقط */
  }
  listeners.forEach((f) => f());
}

function subscribe(f: () => void): () => void {
  listeners.add(f);
  const onStorage = (e: StorageEvent) => e.key === SIMPLE_KEY && f();
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(f);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/** اختيار المعلّم الحالي، ويُعاد الرسم عند تغييره في أي شاشة. */
export function useSimplePreference(): SimplePreference {
  return useSyncExternalStore(subscribe, getSimplePreference, () => "auto");
}

/** هل الوضع المبسّط فعّال لهذا المعلّم؟ `centerDefault` من سياق الرئيسية. */
export function useSimpleMode(centerDefault: boolean): boolean {
  return resolveSimpleMode(useSimplePreference(), centerDefault);
}
