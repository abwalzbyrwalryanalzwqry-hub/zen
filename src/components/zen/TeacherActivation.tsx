import { useT } from "@/lib/i18n";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Copy, Crown, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { activateTeacherRole, getFounderCodeForMe, normalizeRoleCode } from "@/lib/roles";

/**
 * «أنا معلّم»: حقل واحد يقبل رمز الدعوة من معلّم أو إدارة مركز، أو رمز المؤسس لأول معلّم في
 * التطبيق. قاعدة البيانات تميّز بينهما وتمنح الدور (activate_teacher_role)، والعميل لا يمنح شيئاً.
 * صاحب التطبيق وحده يرى رمز المؤسس هنا مباشرة (founder_code_for_me) ويفعّل دوره بلمسة.
 */
export function TeacherActivation({
  onActivated,
  compact = false,
}: {
  onActivated?: (kind: "invite" | "founder" | "already") => void;
  compact?: boolean;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<"invite" | "founder" | "already" | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const t = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const ready = normalizeRoleCode(code).length >= 4;
  const founder = useQuery({
    queryKey: ["founder-code-for-me"],
    queryFn: getFounderCodeForMe,
    staleTime: 60_000,
    retry: false,
  });
  const ownerCode = founder.data?.status === "owner" ? founder.data.code : null;

  const copyOwnerCode = async () => {
    if (!ownerCode) return;
    try {
      await navigator.clipboard?.writeText(ownerCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // النسخ غير متاح: الرمز ظاهر ويمكن نسخه يدوياً.
    }
  };

  const submit = async (value: string = code) => {
    if (busy || normalizeRoleCode(value).length < 4) return;
    setBusy(true);
    setErr(null);
    try {
      const kind = await activateTeacherRole(value);
      setDone(kind);
      setCode("");
      await queryClient.invalidateQueries({ queryKey: ["home-context"] });
      await queryClient.invalidateQueries({ queryKey: ["founder-code-for-me"] });
      onActivated?.(kind);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("teacherActivation.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-2" role="status">
        <p className="text-xs font-bold text-primary flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          {t(done === "already" ? "teacherActivation.already" : "teacherActivation.done")}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t(done === "founder" ? "teacherActivation.nextFounder" : "teacherActivation.next")}
        </p>
        <button
          type="button"
          onClick={() => void navigate({ to: "/centers" })}
          className="w-full min-h-11 rounded-2xl bg-primary text-primary-foreground py-2.5 text-xs font-bold flex items-center justify-center gap-2"
        >
          <Building2 className="w-4 h-4" aria-hidden="true" />
          {t(done === "founder" ? "teacherActivation.firstCenter" : "centersPage.title")}
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {ownerCode && (
        <div
          role="group"
          className="rounded-2xl border border-gold/40 bg-gold/10 p-3 space-y-2"
          aria-labelledby="zen-founder-title"
        >
          <p
            id="zen-founder-title"
            className="text-xs font-bold text-foreground flex items-center gap-1.5"
          >
            <Crown className="w-4 h-4 text-gold shrink-0" aria-hidden="true" />
            {t("teacherActivation.ownerTitle")}
          </p>
          <button
            type="button"
            onClick={() => void copyOwnerCode()}
            className="w-full min-h-11 rounded-xl bg-background/70 border border-border px-3 flex items-center justify-center gap-2"
          >
            <span
              dir="ltr"
              data-testid="zen-founder-code"
              className="font-mono text-sm tracking-wider text-foreground break-all"
            >
              {ownerCode}
            </span>
            {copied ? (
              <Check className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            )}
            <span className="sr-only">
              {copied ? t("common.copied") : t("teacherActivation.copyCode")}
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit(ownerCode)}
            className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground px-4 text-xs font-bold disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            {t("teacherActivation.activateFounder")}
          </button>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("teacherActivation.ownerHint")}
          </p>
        </div>
      )}
      {!compact && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("teacherActivation.intro")}
        </p>
      )}
      <div className="flex gap-2">
        <label htmlFor="zen-teacher-code" className="sr-only">
          {t("teacherActivation.codeLabel")}
        </label>
        <div className="flex-1 min-w-0 rounded-xl px-3 flex items-center gap-2 bg-background/70 border border-border focus-within:border-primary">
          <KeyRound className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          <input
            id="zen-teacher-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t("teacherActivation.codePlaceholder")}
            dir="ltr"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            spellCheck={false}
            maxLength={40}
            aria-invalid={!!err}
            aria-describedby={err ? "zen-teacher-code-err" : undefined}
            className="w-full min-w-0 bg-transparent py-2.5 text-sm font-mono tracking-wider outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !ready}
          className="min-h-11 rounded-xl bg-primary text-primary-foreground px-4 text-xs font-bold disabled:opacity-60 flex items-center gap-1.5"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
          {t("teacherActivation.activate")}
        </button>
      </div>
      {err && (
        <p id="zen-teacher-code-err" role="alert" className="text-xs text-destructive">
          {err}
        </p>
      )}
      <button
        type="button"
        onClick={() => setShowHelp((v) => !v)}
        aria-expanded={showHelp}
        className="min-h-11 text-xs text-primary underline underline-offset-2"
      >
        {t("teacherActivation.whereTitle")}
      </button>
      {showHelp && (
        <ul className="text-xs text-muted-foreground leading-relaxed space-y-1 list-disc ps-4">
          <li>
            <b className="text-foreground">{t("teacherActivation.inviteTerm")}</b>{" "}
            {t("teacherActivation.inviteHelp")}
          </li>
          <li>
            <b className="text-foreground">{t("teacherActivation.founderTerm")}</b>{" "}
            {t("teacherActivation.founderHelp")}
            <span dir="ltr" className="block font-mono text-foreground mt-0.5">
              ZEN-XXXXX-XXXXX-XXXXX-XXXXX
            </span>
          </li>
        </ul>
      )}
    </form>
  );
}
