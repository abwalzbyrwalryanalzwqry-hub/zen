import { useLayoutEffect, useRef } from "react";

/**
 * مرجع يحمل آخر قيمة (M12، قاعدة `refs`): للمستمعات وعمليات الخلفية التي تحتاج أحدث دالة أو قيمة دون إعادة
 * الاشتراك. يُحدَّث بعد العرض (لا أثناءه)، فلا يُقرأ `.current` في العرض نفسه.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
