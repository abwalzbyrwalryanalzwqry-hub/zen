import { useEffect, useRef } from "react";
import { RESUME_EVENT } from "@/lib/app-resume";

/** ينفّذ `fn` عند العودة إلى التطبيق من الخلفية (انظر app-resume.ts). */
export function useOnResume(fn: () => void) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    const h = () => ref.current();
    window.addEventListener(RESUME_EVENT, h);
    return () => window.removeEventListener(RESUME_EVENT, h);
  }, []);
}
