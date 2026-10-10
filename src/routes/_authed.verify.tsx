import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BadgeCheck, Ban, Loader2, ScanLine, ShieldX } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { canScan, scanRaw } from "@/lib/qr-attendance";
import { juzOrdinal } from "@/lib/achievements";
import { intlLocale, useLocale, useT, t as tStatic } from "@/lib/i18n";
import { parseVerifyCode, verifyCertificate, type VerifyResult } from "@/lib/achievements/verify";
import { usePagesDict } from "@/lib/pages-i18n";
import { useAsync } from "@/hooks/use-async";

/**
 * التحقق من شهادة زن (10.2): مسح QR الشهادة بماسح Google في Android أو كتابة رمزها. شهائد الاستوديو تحمل
 * رابط `zen://verify?code=…` فيفتح ماسح الكاميرا هذه الصفحة ويتحقق تلقائياً (`?code=`).
 */
export const Route = createFileRoute("/_authed/verify")({
  head: () => ({ meta: [{ title: tStatic("meta.verify") }] }),
  validateSearch: (s: Record<string, unknown>): { code?: string } =>
    typeof s.code === "string" && s.code ? { code: s.code.slice(0, 64) } : {},
  component: VerifyScreen,
});

function VerifyScreen() {
  usePagesDict();
  const t = useT();
  const { code: linked } = Route.useSearch();
  const linkedCode = linked ? parseVerifyCode(linked) : null;
  const auto = useAsync(linkedCode ? `verify:${linkedCode}` : null, () =>
    verifyCertificate(linkedCode!),
  );
  const [touched, setTouched] = useState(false);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (text: string) => {
    setTouched(true);
    const code = parseVerifyCode(text);
    setResult(null);
    if (!code) {
      setError(t("verify.badCode"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(await verifyCertificate(code));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("verify.failed"));
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    try {
      const raw = await scanRaw();
      if (raw) await submit(raw);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("verify.scanFailed"));
    }
  };

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-4 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <h1 className="text-lg font-black flex-1">{t("verify.title")}</h1>
        </header>
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
          {canScan() && (
            <button
              onClick={() => void scan()}
              disabled={busy}
              className="w-full rounded-3xl gradient-primary text-primary-foreground py-6 text-base font-black flex items-center justify-center gap-3 disabled:opacity-50"
            >
              <ScanLine className="w-6 h-6" aria-hidden="true" /> {t("verify.scan")}
            </button>
          )}
          <form
            className="glass rounded-3xl p-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(manual);
            }}
          >
            <label htmlFor="verify-code" className="text-xs font-bold block">
              {t("verify.manualLabel")}
            </label>
            <input
              id="verify-code"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              dir="ltr"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="w-full rounded-2xl bg-background/60 px-4 py-3 text-center font-mono tracking-widest text-sm"
            />
            <button
              type="submit"
              disabled={busy || !manual.trim()}
              className="w-full rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}{" "}
              {t("verify.submit")}
            </button>
          </form>
          {error && (
            <p role="alert" className="text-xs text-destructive text-center">
              {error}
            </p>
          )}
          {!touched && linked && !linkedCode && (
            <p role="alert" className="text-xs text-destructive text-center">
              {t("verify.badCode")}
            </p>
          )}
          {!touched && auto.loading && (
            <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t("verify.checking")}
            </p>
          )}
          {!touched && auto.error != null && (
            <p role="alert" className="text-xs text-destructive text-center">
              {t("verify.failed")}
            </p>
          )}
          {!touched && auto.data && <ResultCard r={auto.data} />}
          {result && <ResultCard r={result} />}
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            {t("verify.privacy")}
          </p>
        </div>
      </div>
    </PhoneFrame>
  );
}

function ResultCard({ r }: { r: VerifyResult }) {
  const t = useT();
  const locale = useLocale();
  if (r.status === "rate_limited")
    return (
      <p role="alert" className="text-xs text-destructive text-center">
        {t("verify.rateLimited")}
      </p>
    );
  if (r.status === "invalid")
    return (
      <section
        aria-label={t("verify.result")}
        className="glass rounded-3xl p-4 flex items-center gap-3 border border-destructive/40"
      >
        <ShieldX className="w-8 h-8 text-destructive shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-black">{t("verify.invalid")}</p>
          <p className="text-xs text-muted-foreground">{t("verify.invalidHint")}</p>
        </div>
      </section>
    );
  if (r.kind === "studio") return <StudioResult r={r} />;
  const place = [r.halaqa_name, r.center_name].filter(Boolean).join(" — ");
  return (
    <section
      aria-label={t("verify.result")}
      className="glass-strong rounded-3xl p-4 space-y-2 border border-primary/40"
    >
      <div className="flex items-center gap-2">
        <BadgeCheck className="w-7 h-7 text-primary" aria-hidden="true" />
        <p className="text-sm font-black text-primary">{t("verify.valid")}</p>
      </div>
      <p className="text-base font-black">{r.student_name}</p>
      <p className="text-xs">
        {t("verify.completedJuz", { juz: locale === "ar" ? juzOrdinal(r.juz) : r.juz })}
      </p>
      {place && <p className="text-xs text-muted-foreground">{place}</p>}
      <p className="text-xs text-muted-foreground">
        {t("verify.approvedBy", {
          teacher: r.teacher_name ?? t("verify.teacher"),
          date: new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }).format(
            r.decided_at ? new Date(r.decided_at) : new Date(),
          ),
        })}
      </p>
      <p className="text-xs text-muted-foreground font-mono" dir="ltr">
        {r.serial}
      </p>
    </section>
  );
}

type StudioVerify = Extract<VerifyResult, { kind: "studio" }>;

/** شهادة من الاستوديو: الحالة والرقم والطالب والمركز والحلقة والنوع وتاريخ الإصدار — لا شيء من سجل الطالب. */
function StudioResult({ r }: { r: StudioVerify }) {
  const t = useT();
  const locale = useLocale();
  const day = (d: string | null) =>
    d
      ? new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }).format(new Date(d))
      : "—";
  const revoked = r.status !== "valid";
  const replaced = r.status === "replaced";
  const rows: [string, string | null][] = [
    [t("verify.number"), r.certificate_number],
    [t("verify.student"), r.student_name],
    [t("verify.center"), r.center_name],
    [t("verify.circle"), r.halaqa_name],
    [t("verify.type"), r.type_name],
    [t("verify.issueDate"), day(r.issue_date)],
  ];
  if (revoked) rows.push([t("verify.revokedAt"), day(r.revoked_at)]);
  if (replaced && r.replaced_by) rows.push([t("verify.replacedBy"), r.replaced_by]);
  if (r.fingerprint) rows.push([t("verify.fingerprint"), r.fingerprint]);
  return (
    <section
      aria-label={t("verify.result")}
      className={`glass-strong rounded-3xl p-4 space-y-3 border ${revoked ? "border-destructive/50" : "border-primary/40"}`}
    >
      <div className="flex items-center gap-2">
        {revoked ? (
          <Ban className="w-7 h-7 text-destructive" aria-hidden="true" />
        ) : (
          <BadgeCheck className="w-7 h-7 text-primary" aria-hidden="true" />
        )}
        <div>
          <p className={`text-sm font-black ${revoked ? "text-destructive" : "text-primary"}`}>
            {t(replaced ? "verify.replaced" : revoked ? "verify.revoked" : "verify.validStudio")}
          </p>
          {revoked && (
            <p className="text-xs text-muted-foreground">
              {t(replaced ? "verify.replacedHint" : "verify.revokedHint")}
            </p>
          )}
          {!revoked && r.approved && (
            <p className="text-xs text-muted-foreground">{t("verify.approvedStudio")}</p>
          )}
          {!revoked && r.archived && (
            <p className="text-xs text-muted-foreground">{t("verify.archivedHint")}</p>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd
              className="font-bold break-words"
              dir={k === t("verify.number") || k === t("verify.replacedBy") ? "ltr" : undefined}
            >
              {v || "—"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
