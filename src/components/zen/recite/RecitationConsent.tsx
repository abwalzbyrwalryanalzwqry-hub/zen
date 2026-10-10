/**
 * موافقة التحليل الآلي للصوت في الواجهة (تدقيق أكتوبر 2026، P0-05).
 *
 * - `useRecitationConsent()` (src/hooks/recite/use-recitation-consent.tsx) يعطي `ensure()`: يعيد true إن كانت الموافقة قائمة، وإلا يعرض الحوار وينتظر
 *   قرار المستخدم. الشاشة تستدعيه قبل أي نداء يرسل صوتاً إلى `zen-recitation`.
 * - `RecitationConsentStatus` سطر حالة صغير يتيح السحب أو التفعيل في أي وقت.
 *
 * - القاصرون (القرار 0011، 1.36.0): إقرار «عمري 13 سنة فأكثر» في الحوار. من لم يُقرّ به، أو كان مرتبطاً بوليّ
 *   أمر، تُحفظ موافقته ويُنتظر وليّ أمره من بوابته («متابعة أبنائي»)، ويُشرح له ذلك بدل أن يبدأ التحليل.
 *
 * الخادم يرفض بلا موافقة نافذة على أي حال؛ هذا لتجربة الاستخدام فقط.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConsentDict } from "@/lib/consent-i18n";
import { useT } from "@/lib/i18n";
import { RETENTION } from "@/lib/maintenance-core";
import {
  getRecitationConsentState,
  guardianNote,
  setRecitationConsent,
  type RecitationConsentState,
} from "@/lib/recitation-consent";

export function ConsentDialog({
  open,
  onDone,
  note = null,
}: {
  open: boolean;
  onDone: (ok: boolean) => void;
  /** موافقته محفوظة وتنتظر وليّ الأمر: يُعرض الشرح مباشرة. */
  note?: string | null;
}) {
  const t = useT();
  const [saving, setSaving] = useState(false);
  const [adult, setAdult] = useState(false);
  const [pending, setPending] = useState<string | null>(note);
  const agree = async () => {
    setSaving(true);
    try {
      const st = await setRecitationConsent(true, adult);
      const note = guardianNote(st);
      if (note) setPending(note);
      else onDone(st.effective);
    } catch {
      toast.error(t("recitationConsent.saveFailed"));
    } finally {
      setSaving(false);
    }
  };
  const close = () => {
    setPending(null);
    onDone(false);
  };
  const points = ["pointProvider", "pointRetention", "pointTeacher", "pointOptional", "pointMinor"];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && close()}>
      <DialogContent
        className="max-w-sm rounded-3xl border-border/60 bg-card/95 backdrop-blur-2xl sm:rounded-3xl"
        data-testid="recitation-consent"
      >
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2 font-display text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
            {t("recitationConsent.title")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[0.8rem] leading-relaxed">{t("recitationConsent.intro")}</p>
        <ul className="list-disc space-y-1.5 ps-5 text-[0.75rem] leading-relaxed text-muted-foreground">
          {points.map((k) => (
            <li key={k}>{t(`recitationConsent.${k}`, { days: RETENTION.audioDays })}</li>
          ))}
        </ul>
        <Link
          to="/legal/privacy"
          className="text-[0.75rem] text-gold underline-offset-2 hover:underline"
        >
          {t("recitationConsent.privacy")}
        </Link>
        {pending ? (
          <div className="space-y-2" data-testid="recitation-consent-guardian">
            <p className="rounded-2xl border border-gold/40 bg-gold/10 p-3 text-[0.75rem] leading-relaxed">
              {t(pending)}
            </p>
            <button
              type="button"
              onClick={close}
              className="w-full rounded-2xl bg-primary py-2.5 text-[0.75rem] font-medium text-primary-foreground"
            >
              {t("recitationConsent.understood")}
            </button>
          </div>
        ) : (
          <>
            <label className="flex items-start gap-2 text-[0.75rem] leading-relaxed">
              <input
                type="checkbox"
                checked={adult}
                onChange={(e) => setAdult(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
                data-testid="recitation-consent-age"
              />
              <span>{t("recitationConsent.age13")}</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={close}
                className="rounded-2xl border border-border/60 bg-background/70 py-2.5 text-[0.75rem] font-medium"
              >
                {t("recitationConsent.decline")}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={agree}
                className="rounded-2xl bg-primary py-2.5 text-[0.75rem] font-medium text-primary-foreground"
              >
                {saving ? t("recitationConsent.saving") : t("recitationConsent.agree")}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** سطر الحالة مع السحب/التفعيل. لا يُعرض للضيف ولا قبل معرفة الحالة. */
export function RecitationConsentStatus() {
  useConsentDict();
  const t = useT();
  const [st, setSt] = useState<RecitationConsentState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    getRecitationConsentState(true)
      .then((v) => alive && setSt(v))
      .catch(() => alive && setSt(null));
    return () => {
      alive = false;
    };
  }, []);
  if (st === null) return null;
  const on = st.own;
  const toggle = async () => {
    setBusy(true);
    try {
      setSt(await setRecitationConsent(!on));
    } catch {
      toast.error(t("recitationConsent.saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  const note = guardianNote(st);
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 px-3 py-2 text-[0.72rem] text-muted-foreground"
      data-testid="recitation-consent-status"
    >
      <span className="flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {note
          ? t(note)
          : st.effective
            ? t("recitationConsent.statusOn")
            : t("recitationConsent.statusOff")}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={toggle}
        className="shrink-0 font-medium text-gold disabled:opacity-50"
      >
        {on ? t("recitationConsent.revoke") : t("recitationConsent.enable")}
      </button>
    </div>
  );
}
