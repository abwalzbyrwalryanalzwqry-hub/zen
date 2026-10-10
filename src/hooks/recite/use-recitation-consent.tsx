/** يسأل عن موافقة التحليل الآلي للصوت قبل أول تحليل (P0-05). انظر RecitationConsent.tsx. */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConsentDialog } from "@/components/zen/recite/RecitationConsent";
import { useConsentDict } from "@/lib/consent-i18n";
import { getRecitationConsentState, guardianNote } from "@/lib/recitation-consent";

type Resolver = (ok: boolean) => void;

export function useRecitationConsent(): { ensure: () => Promise<boolean>; dialog: ReactNode } {
  useConsentDict();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const pending = useRef<Resolver | null>(null);

  const settle = useCallback((ok: boolean) => {
    pending.current?.(ok);
    pending.current = null;
    setOpen(false);
  }, []);

  const ensure = useCallback(async () => {
    try {
      const st = await getRecitationConsentState();
      if (st.effective) return true;
      // المرتبط بوليّ أمر وافق وينتظره: نشرح بدل أن نسأل مرة أخرى. وغير المرتبط (ومنه من وافق قبل 1.36.0 بلا
      // إقرار عمر) يُسأل من جديد ومعه إقرار «13 سنة فأكثر».
      setNote(st.hasGuardian ? guardianNote(st) : null);
    } catch {
      // تعذّر السؤال (دون اتصال مثلاً): نمضي والخادم يحسم، فلا نسأل من وافق من قبل مرة أخرى.
      return true;
    }
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setOpen(true);
    });
  }, []);

  const dialog = <ConsentDialog key={note ?? "ask"} open={open} note={note} onDone={settle} />;
  return { ensure, dialog };
}
