import { useEffect, useState } from "react";
import { Copy, KeyRound, Loader2, Users, X } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { intlLocale, useLocale, useT } from "@/lib/i18n";
import {
  createGuardianCode,
  formatGuardianCode,
  listStudentGuardians,
  RELATIONS,
  removeGuardianLink,
  type GuardianRelation,
  type StudentGuardian,
} from "@/lib/guardian";

/**
 * إدارة أولياء أمر طالب: يستعملها الطالب في ملفه، ومعلّم الحلقة في صفحة الطالب.
 * إصدار رمز ربط (72 ساعة، مرة واحدة) وعرض المرتبطين وفكّ الربط.
 */
export function GuardianLinkCard({
  studentId,
  asTeacher = false,
}: {
  studentId: string;
  asTeacher?: boolean;
}) {
  const [guardians, setGuardians] = useState<StudentGuardian[]>([]);
  const [relation, setRelation] = useState<GuardianRelation>("father");
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const t = useT();
  const locale = useLocale();
  // window.confirm كان يظهر بنص المتصفح وخارج تصميم التطبيق (تحليل «المزيد» UX-06).
  const [confirmDialog, ask] = useConfirm();

  const reload = () => void listStudentGuardians(studentId).then(setGuardians);
  useEffect(reload, [studentId]);

  const issue = async () => {
    setBusy(true);
    setErr(null);
    setCopied(false);
    try {
      setCode(await createGuardianCode(studentId, relation));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("guardianLink.issueFailed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (g: StudentGuardian) => {
    const ok = await ask({
      title: t("guardianLink.unlinkTitle", { name: g.name }),
      description: t(asTeacher ? "guardianLink.unlinkBodyTeacher" : "guardianLink.unlinkBody"),
      confirmLabel: t("guardianLink.unlink"),
    });
    if (!ok) return;
    try {
      await removeGuardianLink(g.guardian_id, studentId);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("guardianLink.unlinkFailed"));
    }
  };

  const copy = async () => {
    if (!code) return;
    await navigator.clipboard?.writeText(formatGuardianCode(code.code));
    setCopied(true);
  };

  return (
    <div className="p-4 space-y-3">
      {confirmDialog}
      <p className="text-xs text-muted-foreground leading-relaxed">
        {t(asTeacher ? "guardianLink.hintTeacher" : "guardianLink.hint")}
      </p>

      {guardians.length > 0 && (
        <ul className="space-y-1.5">
          {guardians.map((g) => (
            <li key={g.guardian_id} className="flex items-center gap-2 rounded-2xl glass px-3 py-2">
              <Users className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
              <span className="flex-1 text-xs text-foreground">
                {g.name} ·{" "}
                <span className="text-muted-foreground">
                  {t(`guardianLink.relations.${g.relation}`)}
                </span>
              </span>
              <button
                onClick={() => void remove(g)}
                aria-label={t("guardianLink.unlinkAria", { name: g.name })}
                className="w-11 h-11 -my-2 rounded-lg flex items-center justify-center text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <label htmlFor={`relation-${studentId}`} className="sr-only">
          {t("guardianLink.relation")}
        </label>
        <select
          id={`relation-${studentId}`}
          value={relation}
          onChange={(e) => setRelation(e.target.value as GuardianRelation)}
          className="min-h-11 rounded-xl glass px-3 text-xs bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {RELATIONS.map((r) => (
            <option key={r} value={r} className="bg-background">
              {t(`guardianLink.relations.${r}`)}
            </option>
          ))}
        </select>
        <button
          onClick={() => void issue()}
          disabled={busy}
          className="flex-1 min-h-11 rounded-2xl bg-primary text-primary-foreground py-2.5 text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <KeyRound className="w-4 h-4" aria-hidden="true" />
          )}
          {t("guardianLink.issue")}
        </button>
      </div>

      {code && (
        <div className="space-y-1">
          <button
            onClick={() => void copy()}
            aria-label={t("guardianLink.copyAria", { code: formatGuardianCode(code.code) })}
            className="w-full min-h-11 glass-strong rounded-2xl py-2.5 flex items-center justify-center gap-2"
          >
            <span className="font-mono text-sm tracking-widest text-gold" dir="ltr">
              {formatGuardianCode(code.code)}
            </span>
            <Copy className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          </button>
          <p className="text-xs text-muted-foreground text-center" aria-live="polite">
            {copied ? `${t("guardianLink.copied")} ` : ""}
            {t("guardianLink.validUntil", {
              time: new Date(code.expires_at).toLocaleString(intlLocale(locale), {
                weekday: "long",
                hour: "numeric",
                minute: "2-digit",
              }),
            })}
          </p>
        </div>
      )}

      {err && (
        <p role="alert" className="text-xs text-destructive">
          {err}
        </p>
      )}
    </div>
  );
}
