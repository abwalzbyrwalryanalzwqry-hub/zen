import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Presentation, Loader2, Printer, FileDown, RotateCcw } from "lucide-react";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { certApi, type IssuedRef } from "@/lib/certificates/api";
import { renderIssued, mapLimit } from "@/lib/certificates/issued";
import { batchFileBase, exportCertificatePdf, printCertificates } from "@/lib/certificates/export";
import { domMeasurer } from "@/lib/certificates/fit";
import { localDayKey } from "@/lib/local-day";
import { SBtn } from "./StudioFrame";
import { batchPages, STEP_KEYS, type StepKey } from "./helpers";

/** مراحل التحميل بالنصوص المطلوبة حرفياً. */
export function IssueProgress({ step }: { step: StepKey }) {
  const t = useT();
  const cur = STEP_KEYS.indexOf(step);
  return (
    <ol role="status" aria-live="polite" className="space-y-2 py-4 max-w-sm mx-auto">
      {STEP_KEYS.map((k, i) => (
        <li
          key={k}
          className={`flex items-center gap-2 text-sm ${i > cur ? "text-muted-foreground/50" : ""}`}
        >
          {i < cur || step === "done" ? (
            <CheckCircle2 className="w-4 h-4 text-primary" />
          ) : i === cur ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : (
            <span className="w-4 h-4 rounded-full border border-border" />
          )}
          <span className={i === cur ? "font-black" : ""}>{t(`certificates.steps.${k}`)}</span>
        </li>
      ))}
    </ol>
  );
}

export function IssueResults({
  issued,
  halaqaName,
  onAgain,
}: {
  issued: IssuedRef[];
  halaqaName: string;
  onAgain: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState<StepKey | null>(null);
  // 1.24.0: ما ينتظر اعتماد المدير لا رقم له ولا يُنزَّل بعد.
  const done = issued.filter((c) => c.status === "issued");
  const pending = issued.length - done.length;
  const run = async (kind: "pdf" | "print") => {
    try {
      setBusy("prepare");
      const pages = await batchPages(
        done.map((c) => c.id),
        setBusy,
      );
      setBusy("file");
      const size = pages[0].size;
      const title = `${t("certificates.circle.title")} — ${halaqaName}`;
      if (kind === "pdf")
        await exportCertificatePdf(
          pages.map((p) => p.html),
          size,
          batchFileBase(halaqaName, localDayKey()),
          title,
        );
      else
        await printCertificates(
          pages.map((p) => p.html),
          size,
          title,
        );
      setBusy("done");
      setTimeout(() => setBusy(null), 900);
    } catch (e) {
      console.warn("[certificates] batch export", e);
      setBusy(null);
      toast.error(t("certificates.err.generic"), {
        action: { label: t("certificates.retry"), onClick: () => void run(kind) },
      });
    }
  };
  return (
    <div className="space-y-4">
      {done.length > 0 && (
        <div className="rounded-2xl bg-primary/10 text-primary p-4 flex items-center gap-2 font-black">
          <CheckCircle2 className="w-5 h-5" /> {t("certificates.wizard.issued", { n: done.length })}
        </div>
      )}
      {pending > 0 && (
        <div className="rounded-2xl border border-gold/50 bg-gold/10 p-4 text-sm">
          <p className="font-black">
            {t("certificates.approval.sentForApproval", { count: pending })}
          </p>
          <p className="text-xs text-muted-foreground">{t("certificates.approval.waitHint")}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {done.length > 0 && (
          <>
            <SBtn tone="primary" disabled={!!busy} onClick={() => void run("pdf")}>
              <FileDown className="w-4 h-4" />{" "}
              {done.length > 1 ? t("certificates.wizard.downloadAll") : t("certificates.view.pdf")}
            </SBtn>
            <SBtn disabled={!!busy} onClick={() => void run("print")}>
              <Printer className="w-4 h-4" />{" "}
              {done.length > 1 ? t("certificates.wizard.printAll") : t("certificates.view.print")}
            </SBtn>
          </>
        )}
        {done.length > 0 && (
          <Link
            to="/certificates/ceremony"
            search={{ ids: done.map((c) => c.id).join(",") }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-bold hover:bg-muted"
          >
            <Presentation className="w-4 h-4" /> {t("certificates.ceremony.open")}
          </Link>
        )}
        <SBtn onClick={onAgain} disabled={!!busy}>
          <RotateCcw className="w-4 h-4" /> {t("certificates.home.new")}
        </SBtn>
      </div>
      {busy && <IssueProgress step={busy} />}
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
        {issued.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="flex-1 min-w-0 font-bold break-words">{c.student_name}</span>
            {c.status === "issued" ? (
              <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                {c.certificate_number}
              </span>
            ) : (
              <span className="text-xs font-bold">{t("certificates.status.pending")}</span>
            )}
            <Link
              to="/certificates/$id"
              params={{ id: c.id }}
              className="text-xs font-bold text-primary"
            >
              {t("certificates.open")}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
