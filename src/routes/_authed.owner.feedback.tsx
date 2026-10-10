import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { SettingsShell } from "@/components/zen/settings/SettingsShell";
import { QueryError } from "@/components/zen/QueryError";
import { listFeedback, setFeedbackStatus, type FeedbackRow } from "@/lib/feedback";
import { intlLocale, useLocale, useT, t as tStatic } from "@/lib/i18n";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/_authed/owner/feedback")({
  head: () => ({ meta: [{ title: tStatic("meta.ownerFeedback") }] }),
  component: OwnerFeedback,
});

const NEXT: Record<FeedbackRow["status"], FeedbackRow["status"]> = {
  new: "seen",
  seen: "done",
  done: "new",
};

/** بلاغات المستخدمين لصاحب التطبيق (GAP-02). RLS تمنع غيره، فيرى غير المالك رسائله فقط. */
function OwnerFeedback() {
  const t = useT();
  const locale = useLocale();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["owner-feedback"], queryFn: () => listFeedback() });
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const advance = async (r: FeedbackRow) => {
    try {
      await setFeedbackStatus(r.id, NEXT[r.status]);
      await qc.invalidateQueries({ queryKey: ["owner-feedback"] });
    } catch {
      toast.error(t("ownerFeedback.statusFailed"));
    }
  };
  return (
    <SettingsShell title={t("ownerFeedback.title")}>
      {q.isPending ? (
        <div className="flex justify-center py-10" role="status" aria-label={t("common.loading")}>
          <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
        </div>
      ) : q.isError ? (
        <QueryError onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <p className="glass rounded-3xl p-4 text-sm text-muted-foreground text-center">
          {t("ownerFeedback.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {q.data.map((r) => (
            <li key={r.id} className="glass rounded-2xl p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary font-bold">
                  {t(`feedback.kinds.${r.kind}`)}
                </span>
                <span className="flex-1 text-muted-foreground">
                  {fmt.format(new Date(r.created_at))}
                </span>
                <button
                  type="button"
                  onClick={() => void advance(r)}
                  aria-label={t("ownerFeedback.statusAria", {
                    status: t(`ownerFeedback.status.${r.status}`),
                  })}
                  className="min-h-11 px-3 rounded-xl glass-strong font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {t(`ownerFeedback.status.${r.status}`)}
                </button>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words" dir="auto">
                {r.message}
              </p>
              <p className="text-xs text-muted-foreground font-mono" dir="ltr">
                {[r.app_version, r.platform, r.locale, r.route].filter(Boolean).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SettingsShell>
  );
}
