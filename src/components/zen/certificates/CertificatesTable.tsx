import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Ban, Eye, FileDown, Loader2, RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n";
import { fmtShortDate } from "@/lib/reports/format";
import { toast } from "@/lib/toast";
import type { CertListItem, CertStatus } from "@/lib/certificates/api";
import { certApi } from "@/lib/certificates/api";
import { renderIssued } from "@/lib/certificates/issued";
import { exportCertificatePdf } from "@/lib/certificates/export";
import { domMeasurer } from "@/lib/certificates/fit";
import { RevokeDialog } from "./RevokeDialog";
import { downloadCertificate } from "./helpers";
import { ApprovalButtons } from "./ApprovalActions";

const TONE: Record<CertStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  ready: "bg-gold/20 text-foreground",
  pending: "bg-gold/25 text-foreground",
  rejected: "bg-destructive/10 text-destructive",
  issued: "bg-primary/10 text-primary",
  revoked: "bg-destructive/10 text-destructive",
  archived: "bg-muted text-muted-foreground",
};

/** ما صدر فعلاً (له رقم): يُنزَّل ويُعاد إصداره. المعلّقة والمردودة لم تصدر. */
const DONE = new Set<CertStatus>(["issued", "revoked", "archived"]);

export function StatusBadge({ status }: { status: CertStatus }) {
  const t = useT();
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ${TONE[status]}`}
    >
      {t(`certificates.status.${status}`)}
    </span>
  );
}

/** جدول الشهائد: جدول على الشاشات الواسعة وبطاقات على الجوال، بالأعمدة والإجراءات المطلوبة. */
export function CertificatesTable({
  items,
  onChanged,
}: {
  items: CertListItem[];
  onChanged: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<CertListItem | null>(null);
  const pdf = async (c: CertListItem) => {
    setBusy(c.id);
    try {
      await downloadCertificate(c.id);
    } catch (e) {
      console.warn("[certificates] pdf", e);
      toast.error(t("certificates.err.generic"), {
        action: { label: t("certificates.retry"), onClick: () => void pdf(c) },
      });
    } finally {
      setBusy(null);
    }
  };
  const date = (c: CertListItem) =>
    c.issue_date
      ? fmtShortDate(c.issue_date, { digits: "latn", calendar: "gregorian" })
      : t("certificates.none");
  const Actions = ({ c }: { c: CertListItem }) => (
    <div className="flex items-center gap-1">
      <Link
        to="/certificates/$id"
        params={{ id: c.id }}
        className="p-1.5 rounded-lg hover:bg-muted"
        aria-label={t("certificates.open")}
        title={t("certificates.open")}
      >
        <Eye className="w-4 h-4" />
      </Link>
      {DONE.has(c.status) && (
        <button
          type="button"
          onClick={() => void pdf(c)}
          disabled={busy === c.id}
          className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-40"
          aria-label={t("certificates.view.pdf")}
          title={t("certificates.view.pdf")}
        >
          {busy === c.id ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileDown className="w-4 h-4" />
          )}
        </button>
      )}
      {c.status === "issued" && c.can_revoke && (
        <button
          type="button"
          onClick={() => setRevoke(c)}
          className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive"
          aria-label={t("certificates.view.revoke")}
          title={t("certificates.view.revoke")}
        >
          <Ban className="w-4 h-4" />
        </button>
      )}
      {c.can_approve && c.status === "pending" && (
        <ApprovalButtons ids={[c.id]} onDone={onChanged} compact />
      )}
      {c.can_issue && DONE.has(c.status) && !c.replaced_by && (
        <Link
          to="/certificates/new"
          search={{ replaces: c.id }}
          className="p-1.5 rounded-lg hover:bg-muted"
          aria-label={t("certificates.view.reissue")}
          title={t("certificates.view.reissue")}
        >
          <RefreshCw className="w-4 h-4" />
        </Link>
      )}
      {(c.status === "draft" || c.status === "ready") && c.batch_id && (
        <Link
          to="/certificates/new"
          search={{ batch: c.batch_id }}
          className="text-xs font-bold text-primary px-1.5"
        >
          {t("certificates.wizard.resumeDraft")}
        </Link>
      )}
    </div>
  );
  return (
    <>
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {[
                "number",
                "student",
                "center",
                "halaqa",
                "type",
                "template",
                "date",
                "status",
                "actions",
              ].map((k) => (
                <th
                  key={k}
                  scope="col"
                  className="text-start font-bold px-3 py-2 whitespace-nowrap"
                >
                  {t(`certificates.col.${k}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap" dir="ltr">
                  {c.certificate_number ?? t("certificates.none")}
                </td>
                <td className="px-3 py-2 font-bold">{c.student_name}</td>
                <td className="px-3 py-2 text-xs">{c.center_name}</td>
                <td className="px-3 py-2 text-xs">{c.halaqa_name}</td>
                <td className="px-3 py-2 text-xs">{c.type_name}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {c.template_name ?? t("certificates.none")}
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{date(c)}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-3 py-2">
                  <Actions c={c} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="md:hidden space-y-2">
        {items.map((c) => (
          <li key={c.id} className="rounded-2xl border border-border bg-card p-3 space-y-1">
            <div className="flex items-start gap-2">
              <p className="flex-1 min-w-0 font-black text-sm break-words">{c.student_name}</p>
              <StatusBadge status={c.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {c.type_name} · {c.halaqa_name} · {date(c)}
            </p>
            <div className="flex items-center gap-2">
              <span className="flex-1 font-mono text-[0.6875rem]" dir="ltr">
                {c.certificate_number ?? ""}
              </span>
              <Actions c={c} />
            </div>
          </li>
        ))}
      </ul>
      {revoke && (
        <RevokeDialog
          id={revoke.id}
          number={revoke.certificate_number}
          name={revoke.student_name}
          onClose={() => setRevoke(null)}
          onDone={onChanged}
        />
      )}
    </>
  );
}
