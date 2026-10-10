import { useEffect, useState } from "react";
import { BookMarked, Loader2 } from "lucide-react";
import { getAiConsent, setAiConsent, type AiConsent } from "@/lib/assistant-client";

/**
 * موافقة «سياق حفظي» للمساعد (12.2): عند التفعيل يضيف الخادم إلى سؤالك ملخّصاً قصيراً (مهام اليوم،
 * وآخر مواضع الخطأ في الاختبارات، وعدد الصفحات المحفوظة، والسلسلة). يمكن سحبها في أي وقت.
 */
export function AiContextConsent() {
  const [c, setC] = useState<AiConsent | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getAiConsent()
      .then(setC)
      .catch(() => setC({ memo_context: false, granted_at: null, revoked_at: null }));
  }, []);
  if (!c) return null;

  const change = async (v: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      setC(await setAiConsent(v));
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر الحفظ.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 pb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full glass rounded-2xl px-3 py-2 flex items-center gap-2 text-right"
      >
        <BookMarked className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
        <span className="flex-1 text-[0.6875rem] font-bold">سياق حفظي للمساعد</span>
        <span
          className={`text-[0.625rem] font-bold ${c.memo_context ? "text-primary" : "text-muted-foreground"}`}
        >
          {c.memo_context ? "مفعّل" : "غير مفعّل"}
        </span>
      </button>
      {open && (
        <div
          role="region"
          aria-label="موافقة سياق الحفظ"
          className="glass-strong rounded-2xl p-3 mt-2 space-y-2"
        >
          <p className="text-[0.6875rem] leading-relaxed">
            عند الموافقة يُرسل مع كل سؤال ملخّص قصير ليخصّص المساعد نصيحته: مهام اليوم، وآخر مواضع
            الخطأ في الاختبارات (أسماء السور وأرقام الآيات)، وعدد صفحاتك المحفوظة، وأيام التزامك. لا
            يُرسل اسمك ولا درجاتك ولا «محاسبتي»، ولا يُحفظ الملخّص.
          </p>
          {err && (
            <p role="alert" className="text-[0.6875rem] text-destructive">
              {err}
            </p>
          )}
          <button
            onClick={() => void change(!c.memo_context)}
            disabled={busy}
            className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 ${
              c.memo_context ? "glass text-destructive" : "bg-primary text-primary-foreground"
            }`}
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {c.memo_context ? "سحب الموافقة" : "أوافق على استعمال سياق حفظي"}
          </button>
        </div>
      )}
    </div>
  );
}
