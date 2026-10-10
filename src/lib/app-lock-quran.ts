/**
 * «قراءة المصحف دون فتح القفل» (1.29.0، اختياري ومعطّل افتراضياً). راحة لا حدّ أمان: الطبقة الأصلية تبقى
 * «مقفلة» (لا تغيير في الإعدادات ولا استعادة)، والواجهة تعرض صفحة القراءة وحدها (READ_PATH) بدل شاشة القفل،
 * وأي انتقال آخر يعيد شاشة القفل فوراً. الحالة في الذاكرة فقط: إعادة التشغيل تعيد شاشة القفل.
 */
import { useSyncExternalStore } from "react";

export const READ_PATH = "/mushaf/read";

let active = false;
const subs = new Set<() => void>();

function set(v: boolean) {
  if (active === v) return;
  active = v;
  for (const s of subs) s();
}

export const enterQuranWhileLocked = () => set(true);
export const leaveQuranWhileLocked = () => set(false);
export const quranWhileLockedActive = () => active;

export function isReadPath(path: string): boolean {
  return path === READ_PATH || path.startsWith(`${READ_PATH}/`) || path.startsWith(`${READ_PATH}?`);
}

export function useQuranWhileLocked(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => active,
    () => false,
  );
}
