import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { SettingsShell } from "@/components/zen/settings/SettingsShell";
import { useSession } from "@/hooks/useSession";
import {
  FEEDBACK_KINDS,
  FEEDBACK_MAX,
  feedbackError,
  sendFeedback,
  type FeedbackKind,
} from "@/lib/feedback";
import { useT, t as tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/_authed/feedback")({
  validateSearch: (s: Record<string, unknown>): { from?: string } =>
    typeof s.from === "string" && s.from.startsWith("/") ? { from: s.from } : {},
  head: () => ({ meta: [{ title: tStatic("meta.feedback") }] }),
  component: FeedbackPage,
});

/** «أبلغ عن مشكلة أو اقترح» (GAP-02): نوع الرسالة ونصها، ويُرفق الإصدار والمنصة والصفحة تلقائياً. */
function FeedbackPage() {
  const t = useT();
  const { from } = Route.useSearch();
  const { guest } = useSession();
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const invalid = feedbackError({ kind, message }) !== null;

  const submit = async () => {
    if (busy || invalid) return;
    setBusy(true);
    setErr(null);
    try {
      await sendFeedback({ kind, message, route: from });
      setSent(true);
      setMessage("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("feedback.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (guest) {
    return (
      <SettingsShell title={t("feedback.title")}>
        <p className="glass rounded-3xl p-4 text-sm text-muted-foreground">{t("feedback.guest")}</p>
      </SettingsShell>
    );
  }

  return (
    <SettingsShell title={t("feedback.title")}>
      {sent ? (
        <div role="status" className="glass-strong rounded-3xl p-5 space-y-3 text-center">
          <CheckCircle2 className="w-10 h-10 text-primary mx-auto" aria-hidden="true" />
          <p className="text-sm font-black text-foreground">{t("feedback.thanks")}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("feedback.thanksHint")}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSent(false)}
              className="flex-1 min-h-11 rounded-2xl glass text-xs font-bold"
            >
              {t("feedback.another")}
            </button>
            <Link
              to="/more"
              className="flex-1 min-h-11 rounded-2xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center"
            >
              {t("feedback.backToMore")}
            </Link>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="px-2 text-xs text-muted-foreground leading-relaxed">
            {t("feedback.intro")}
          </p>
          <fieldset className="glass rounded-3xl p-4">
            <legend className="sr-only">{t("feedback.kindLabel")}</legend>
            <div
              role="radiogroup"
              aria-label={t("feedback.kindLabel")}
              className="grid grid-cols-2 gap-2"
            >
              {FEEDBACK_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={`min-h-12 rounded-2xl px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    kind === k
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/60 text-foreground"
                  }`}
                >
                  {t(`feedback.kinds.${k}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="glass rounded-3xl p-4 space-y-2">
            <label htmlFor="zen-feedback-msg" className="block text-sm font-bold text-foreground">
              {t(`feedback.messageLabel.${kind}`)}
            </label>
            <textarea
              id="zen-feedback-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={FEEDBACK_MAX}
              aria-describedby="zen-feedback-count zen-feedback-privacy"
              className="w-full rounded-2xl bg-background/70 border border-border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <p
              id="zen-feedback-count"
              className="text-xs text-muted-foreground text-end tabular-nums"
            >
              {message.trim().length} / {FEEDBACK_MAX}
            </p>
            <p id="zen-feedback-privacy" className="text-xs text-muted-foreground leading-relaxed">
              {t("feedback.privacy")}
            </p>
          </div>
          {err && (
            <p role="alert" className="text-xs text-destructive text-center">
              {err}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || invalid}
            className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="w-4 h-4 rtl:-scale-x-100" aria-hidden="true" />
            )}
            {t("feedback.send")}
          </button>
        </form>
      )}
    </SettingsShell>
  );
}
