/**
 * مضيف حوار موافقة الذكاء الاصطناعي النصّي (N-03): يُركَّب مرة في التخطيط المحمي، ويستجيب لـ
 * `ensureTextAiConsent()` من أي شاشة. الحوار نفسه يُحمَّل كسولاً، فلا يثقل الحزمة الأولى.
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { registerTextAiHost, type TextAiState } from "@/lib/text-ai-consent";

const Dialog = lazy(() => import("./TextAiConsentDialog"));

export function TextAiConsentHost() {
  const [state, setState] = useState<TextAiState | null>(null);
  const pending = useRef<((ok: boolean) => void) | null>(null);

  useEffect(
    () =>
      registerTextAiHost(
        (st) =>
          new Promise<boolean>((resolve) => {
            pending.current?.(false);
            pending.current = resolve;
            setState(st);
          }),
      ),
    [],
  );

  if (!state) return null;
  const done = (ok: boolean) => {
    pending.current?.(ok);
    pending.current = null;
    setState(null);
  };
  return (
    <Suspense fallback={null}>
      <Dialog key={String(state.hasGuardian)} open state={state} onDone={done} />
    </Suspense>
  );
}
