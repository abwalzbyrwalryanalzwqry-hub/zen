import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * تحميل غير متزامن مربوط بمفتاح (M12، قاعدة React Compiler `set-state-in-effect`). يحلّ محل النمط
 * `useEffect(() => { setLoading(true); load().then(setData) }, [dep])`: لا setState متزامن داخل الأثر، و«جارٍ
 * التحميل» مشتق من أن آخر نتيجة تخصّ مفتاحاً آخر. النتيجة المتأخرة لمفتاح قديم تُهمل.
 *
 * `key = null` ⇒ لا تحميل (مثل انتظار الجلسة). للتحميل الذي يحتاج إعادة محاولة وذاكرة مشتركة بين الشاشات
 * استعمل React Query؛ هذا للشاشات التي كانت تحمّل بأثر واحد.
 */
export type AsyncState<T> = {
  data: T | undefined;
  /** آخر بيانات وصلت ولو لمفتاح سابق — لإبقاء الشاشة ظاهرة أثناء تحميل فترة أخرى. */
  latest: T | undefined;
  error: unknown;
  /** لا نتيجة بعد للمفتاح الحالي (أول تحميل أو بعد تغيّر المفتاح). */
  loading: boolean;
  /** يعيد التحميل للمفتاح نفسه؛ تبقى البيانات السابقة ظاهرة حتى تصل الجديدة. يكتمل الوعد بعد وصولها. */
  reload: () => Promise<void>;
  /** تعديل محلي للبيانات (بعد حفظ أو تحديث متفائل) دون نداء جديد. */
  setData: (update: (prev: T | undefined) => T | undefined) => void;
};

type Result<T> = { key: string; data?: T; error?: unknown };

export function useAsync<T>(key: string | null, load: () => Promise<T>): AsyncState<T> {
  const loadRef = useRef(load);
  const keyRef = useRef(key);
  useLayoutEffect(() => {
    loadRef.current = load;
    keyRef.current = key;
  });
  const [res, setRes] = useState<Result<T> | null>(null);

  useEffect(() => {
    if (key === null) return;
    let alive = true;
    loadRef.current().then(
      (data) => alive && setRes({ key, data }),
      (error: unknown) => alive && setRes({ key, error }),
    );
    return () => {
      alive = false;
    };
  }, [key]);

  const reload = useCallback(async () => {
    const k = keyRef.current;
    if (k === null) return;
    let next: Result<T>;
    try {
      next = { key: k, data: await loadRef.current() };
    } catch (error) {
      next = { key: k, error };
    }
    // نتيجة مفتاح تغيّر أثناء الانتظار لا تغلب نتيجة المفتاح الجديد.
    if (keyRef.current === k) setRes(next);
  }, []);
  const setData = useCallback(
    (update: (prev: T | undefined) => T | undefined) =>
      setRes((r) => (r ? { key: r.key, data: update(r.data) } : r)),
    [],
  );
  const mine = key !== null && res?.key === key ? res : null;
  return {
    data: mine?.data,
    latest: mine ? mine.data : res?.data,
    error: mine?.error ?? null,
    loading: key !== null && !mine,
    reload,
    setData,
  };
}
