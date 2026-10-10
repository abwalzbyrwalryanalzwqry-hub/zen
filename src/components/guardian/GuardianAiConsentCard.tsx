/**
 * بوابة وليّ الأمر: موافقته على التحليل الآلي لصوت ابنه (القرار 0011، 1.36.0). الخادم لا يحلّل صوت القاصر
 * إلا بموافقة الابن ووليّ أمر مرتبط معاً (`has_recitation_ai_consent`).
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useConsentDict } from "@/lib/consent-i18n";
import { useT } from "@/lib/i18n";
import {
  listGuardianConsents,
  setGuardianConsent,
  type GuardianConsentRow,
} from "@/lib/recitation-consent";

export function GuardianAiConsentCard({ studentId }: { studentId: string }) {
  useConsentDict();
  const t = useT();
  const [row, setRow] = useState<GuardianConsentRow | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    listGuardianConsents()
      .then((rows) => alive && setRow(rows.find((r) => r.student_id === studentId) ?? null))
      .catch(() => alive && setRow(null));
    return () => {
      alive = false;
    };
  }, [studentId]);
  if (!row) return null;
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      const v = await setGuardianConsent(studentId, on);
      setRow({ ...row, recitation_audio: v });
    } catch {
      toast.error(t("guardianConsent.saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="space-y-2 rounded-3xl border border-border/60 bg-card/70 p-4"
      data-testid="guardian-ai-consent"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
          {t("guardianConsent.title")}
        </h3>
        <button
          type="button"
          role="switch"
          aria-checked={row.recitation_audio}
          aria-label={t("guardianConsent.title")}
          disabled={busy}
          onClick={() => toggle(!row.recitation_audio)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            row.recitation_audio ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-[inset-inline-start] ${
              row.recitation_audio ? "start-[1.375rem]" : "start-0.5"
            }`}
          />
        </button>
      </div>
      <p className="text-[0.75rem] leading-relaxed text-muted-foreground">
        {t("guardianConsent.intro")}
      </p>
      <p className="text-[0.75rem] font-medium">
        {t(row.student_consent ? "guardianConsent.childAsked" : "guardianConsent.childNot")}
        {" · "}
        {t(row.recitation_audio ? "guardianConsent.on" : "guardianConsent.off")}
      </p>
      <Link
        to="/legal/privacy"
        className="text-[0.75rem] text-gold underline-offset-2 hover:underline"
      >
        {t("guardianConsent.privacy")}
      </Link>
    </section>
  );
}
