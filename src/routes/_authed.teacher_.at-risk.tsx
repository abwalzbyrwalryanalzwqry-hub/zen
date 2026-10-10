import { useT, t as tStatic } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GuardianSend } from "@/components/zen/teacher/GuardianSend";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, MessageSquareText, ListChecks } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { useSession } from "@/hooks/useSession";
import {
  fetchAtRisk,
  guardianMessage,
  reasonLabel,
  reviewPlan,
  shareText,
  type AtRiskStudent,
} from "@/lib/at-risk";

/** الإنذار المبكر (9.4): /teacher/at-risk */
export const Route = createFileRoute("/_authed/teacher_/at-risk")({
  head: () => ({ meta: [{ title: tStatic("meta.atRisk") }] }),
  component: AtRiskScreen,
});

function AtRiskScreen() {
  const t = useT();
  const { userId } = useSession();
  const q = useQuery({
    queryKey: ["at-risk", userId],
    enabled: !!userId,
    queryFn: () => fetchAtRisk(null),
  });
  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col" dir="rtl">
        <header className="px-4 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <div className="flex-1">
            <h1 className="text-lg font-black">{t("atRisk.pageTitle")}</h1>
            <p className="text-[0.6875rem] text-muted-foreground">{t("atRisk.pageSub")}</p>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-2">
          {q.isPending ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : q.isError ? (
            <p role="alert" className="text-center text-xs text-destructive py-8">
              {t("atRisk.failed")}
            </p>
          ) : !q.data.length ? (
            <p className="text-center text-sm text-muted-foreground py-10">{t("atRisk.none")}</p>
          ) : (
            <ul className="space-y-2" aria-label={t("atRisk.list")}>
              {q.data.map((s) => (
                <RiskRow key={s.student_id} s={s} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
}

function RiskRow({ s }: { s: AtRiskStudent }) {
  const t = useT();
  const [open, setOpen] = useState<"msg" | "plan" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const plan = reviewPlan(s);
  const msg = guardianMessage(s);
  return (
    <li className="glass rounded-3xl p-3 space-y-2" data-student={s.student_id}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-gold mt-0.5 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <Link
            to="/quran/student/$userId"
            params={{ userId: s.student_id }}
            className="text-sm font-bold"
          >
            {s.name}
          </Link>
          <p className="text-[0.625rem] text-muted-foreground">{s.halaqa_name}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {s.reasons.map((r) => (
          <span
            key={r}
            className="rounded-full bg-gold/15 text-gold-foreground px-2 py-0.5 text-[0.625rem] font-bold"
          >
            {reasonLabel(r, s)}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setOpen(open === "msg" ? null : "msg")}
          aria-expanded={open === "msg"}
          className="flex-1 rounded-xl glass py-1.5 text-[0.6875rem] font-bold flex items-center justify-center gap-1"
        >
          <MessageSquareText className="w-3.5 h-3.5" /> {t("atRisk.msg")}
        </button>
        {plan && (
          <button
            onClick={() => setOpen(open === "plan" ? null : "plan")}
            aria-expanded={open === "plan"}
            className="flex-1 rounded-xl glass py-1.5 text-[0.6875rem] font-bold flex items-center justify-center gap-1"
          >
            <ListChecks className="w-3.5 h-3.5" /> {t("atRisk.plan")}
          </button>
        )}
      </div>
      {open === "msg" && (
        <div className="space-y-2">
          {!s.has_guardian && (
            <p className="text-[0.625rem] text-muted-foreground">{t("atRisk.noGuardian")}</p>
          )}
          <pre className="whitespace-pre-wrap rounded-2xl bg-background/70 p-3 text-xs font-sans leading-relaxed">
            {msg}
          </pre>
          <button
            onClick={() =>
              void shareText(msg).then((r) =>
                setNote(
                  r === "copied" ? t("atRisk.copied") : r === "shared" ? t("atRisk.shared") : null,
                ),
              )
            }
            className="w-full rounded-xl bg-primary text-primary-foreground py-2 text-xs font-bold"
          >
            {t("atRisk.share")}
          </button>
          {note && (
            <p role="status" className="text-center text-[0.625rem] text-primary">
              {note}
            </p>
          )}
          {s.has_guardian && <GuardianSend studentId={s.student_id} text={msg} />}
        </div>
      )}
      {open === "plan" && plan && (
        <p className="rounded-2xl bg-background/70 p-3 text-xs leading-relaxed">{plan.text}</p>
      )}
    </li>
  );
}
