import { useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * حفظ فوري موحَّد بتأخير (تحليل «المزيد» ARC-07): بدل زر «حفظ» يُنسى، تُحفظ المسودة بعد `delay` من آخر
 * تعديل، وتُحفظ فوراً إن غادر المستخدم الصفحة قبل انقضائه. `onSaved` تُستدعى بالقيمة المحفوظة؛ امسح المسودة
 * فيها فقط إن كانت هي نفسها (`cur === saved`) وإلا ضاع تعديل جرى أثناء الحفظ.
 */
export function useAutoSave<T>(
  draft: T | null,
  save: (v: T) => Promise<void>,
  onSaved: (v: T) => void,
  onError: (e: unknown) => void,
  delay = 600,
): AutoSaveStatus {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const pending = useRef<T | null>(null);
  const fns = useRef({ save, onSaved, onError });
  useEffect(() => {
    fns.current = { save, onSaved, onError };
  });

  // الحفظ متسلسل (1.22.0): طلب واحد في كل مرة، فلا يسبق حفظٌ قديم حفظاً أحدث ولا يُنشأ السجل مرتين.
  const chain = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    pending.current = draft;
    if (draft === null) return;
    const id = setTimeout(() => {
      const v = draft;
      pending.current = null;
      setStatus("saving");
      chain.current = chain.current
        .then(() => fns.current.save(v))
        .then(
          () => {
            setStatus("saved");
            fns.current.onSaved(v);
          },
          (e: unknown) => {
            setStatus("error");
            fns.current.onError(e);
          },
        );
    }, delay);
    return () => clearTimeout(id);
  }, [draft, delay]);

  // المغادرة قبل انقضاء المهلة: لا يضيع آخر تعديل.
  useEffect(
    () => () => {
      const v = pending.current;
      if (v !== null) void chain.current.then(() => fns.current.save(v)).catch(() => undefined);
    },
    [],
  );
  return status;
}
