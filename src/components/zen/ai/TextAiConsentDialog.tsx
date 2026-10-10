/**
 * حوار موافقة الذكاء الاصطناعي النصّي (N-03). يُحمَّل كسولاً من `TextAiConsentHost` عند أول حاجة فقط.
 * القاصر (مرتبط بوليّ أمر، أو لم يُقرّ بـ 13+ بعد الموافقة) يرى شرحاً بدل التفعيل؛ الخادم يرفضه على أي حال.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConsentDict } from "@/lib/consent-i18n";
import { useT } from "@/lib/i18n";
import { getTextAiState, setTextAiConsent, type TextAiState } from "@/lib/text-ai-consent";

const POINTS = ["pointWhat", "pointProvider", "pointMuhasaba", "pointOptional", "pointMinor"];

export default function TextAiConsentDialog({
  open,
  state,
  onDone,
}: {
  open: boolean;
  state: TextAiState | null;
  onDone: (ok: boolean) => void;
}) {
  useConsentDict();
  const t = useT();
  const [saving, setSaving] = useState(false);
  const [adult, setAdult] = useState(false);
  // المرتبط بوليّ أمر قاصر دائماً؛ ومن أقرّ ووافق ثم بقي قاصراً كذلك.
  const [blocked, setBlocked] = useState(!!state?.hasGuardian);

  const agree = async () => {
    setSaving(true);
    try {
      const st = await setTextAiConsent(true, adult);
      if (st.effective) onDone(true);
      else setBlocked(true);
    } catch {
      toast.error(t("textAiConsent.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onDone(false)}>
      <DialogContent
        className="max-w-sm rounded-3xl border-border/60 bg-card/95 backdrop-blur-2xl sm:rounded-3xl"
        data-testid="text-ai-consent"
      >
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2 font-display text-lg">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden />
            {t("textAiConsent.title")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[0.8rem] leading-relaxed">{t("textAiConsent.intro")}</p>
        <ul className="list-disc space-y-1.5 ps-5 text-[0.75rem] leading-relaxed text-muted-foreground">
          {POINTS.map((k) => (
            <li key={k}>{t(`textAiConsent.${k}`)}</li>
          ))}
        </ul>
        <Link
          to="/legal/privacy"
          className="text-[0.75rem] text-gold underline-offset-2 hover:underline"
        >
          {t("textAiConsent.privacy")}
        </Link>
        {blocked ? (
          <div className="space-y-2" data-testid="text-ai-consent-minor">
            <p className="rounded-2xl border border-gold/40 bg-gold/10 p-3 text-[0.75rem] leading-relaxed">
              {t("textAiConsent.minorBlocked")}
            </p>
            <button
              type="button"
              onClick={() => onDone(false)}
              className="w-full rounded-2xl bg-primary py-2.5 text-[0.75rem] font-medium text-primary-foreground"
            >
              {t("textAiConsent.understood")}
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
                data-testid="text-ai-consent-age"
              />
              <span>{t("textAiConsent.age13")}</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => onDone(false)}
                className="rounded-2xl border border-border/60 bg-background/70 py-2.5 text-[0.75rem] font-medium"
              >
                {t("textAiConsent.decline")}
              </button>
              <button
                type="button"
                disabled={saving || !adult}
                onClick={agree}
                className="rounded-2xl bg-primary py-2.5 text-[0.75rem] font-medium text-primary-foreground disabled:opacity-50"
                data-testid="text-ai-consent-agree"
              >
                {saving ? t("textAiConsent.saving") : t("textAiConsent.agree")}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** سطر الحالة مع السحب/التفعيل في الشاشات التي تستعمل الذكاء الاصطناعي. لا يُعرض قبل معرفة الحالة. */
export function TextAiConsentStatus() {
  useConsentDict();
  const t = useT();
  const [st, setSt] = useState<TextAiState | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    getTextAiState(true)
      .then((v) => alive && setSt(v))
      .catch(() => alive && setSt(null));
    return () => {
      alive = false;
    };
  }, []);
  if (st === null) return null;
  const toggle = async () => {
    if (!st.own) {
      setAsking(true);
      return;
    }
    setBusy(true);
    try {
      setSt(await setTextAiConsent(false, false));
    } catch {
      toast.error(t("textAiConsent.saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 px-3 py-2 text-[0.72rem] text-muted-foreground"
      data-testid="text-ai-consent-status"
    >
      <span className="flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {st.effective ? t("textAiConsent.statusOn") : t("textAiConsent.statusOff")}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggle()}
        className="shrink-0 font-medium text-gold disabled:opacity-50"
      >
        {st.own ? t("textAiConsent.revoke") : t("textAiConsent.enable")}
      </button>
      {asking && (
        <TextAiConsentDialog
          open
          state={st}
          onDone={() => {
            setAsking(false);
            void getTextAiState(true).then(setSt);
          }}
        />
      )}
    </div>
  );
}
