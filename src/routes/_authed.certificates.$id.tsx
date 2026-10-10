import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { StoryShareButton } from "@/components/zen/StoryShare";
import { verifyLink } from "@/lib/certificates/qr";
import { localDayOf } from "@/lib/local-day";
import {
  Archive,
  Ban,
  Copy,
  ExternalLink,
  FileDown,
  Image as ImageIcon,
  Loader2,
  Printer,
  RefreshCw,
  Share2,
} from "lucide-react";
import { QueryError } from "@/components/zen/QueryError";
import { ConfirmDialog } from "@/components/zen/common/ConfirmDialog";
import { StudioFrame, SBtn } from "@/components/zen/certificates/StudioFrame";
import { CertPage } from "@/components/zen/certificates/CertPage";
import { StatusBadge } from "@/components/zen/certificates/CertificatesTable";
import { RevokeDialog } from "@/components/zen/certificates/RevokeDialog";
import { ApprovalButtons, PendingReasons } from "@/components/zen/certificates/ApprovalActions";
import { useT, t as tStatic } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { certApi, certKeys, CertError, type CertDetail } from "@/lib/certificates/api";
import { renderIssued } from "@/lib/certificates/issued";
import {
  exportCertificatePdf,
  exportCertificatePngOrPdf,
  printCertificates,
  shareCertificate,
} from "@/lib/certificates/export";
import { domMeasurer } from "@/lib/certificates/fit";
import { useCertificatesDict } from "@/lib/certificates/i18n";

/** /certificates/$id — عرض الشهادة من لقطتها كما صدرت، وتصديرها وإلغاؤها وإعادة إصدارها. */
export const Route = createFileRoute("/_authed/certificates/$id")({
  head: () => ({ meta: [{ title: tStatic("meta.certificatesView") }] }),
  component: CertificateView,
});

type Busy = "pdf" | "png" | "print" | "share" | "archive" | null;

function CertificateView() {
  useCertificatesDict();
  const t = useT();
  const qc = useQueryClient();
  const { id } = Route.useParams();
  const q = useQuery({ queryKey: certKeys.one(id), queryFn: () => certApi.get(id) });
  const page = useQuery({
    queryKey: ["certificates", "page", id, q.data?.status, q.dataUpdatedAt],
    enabled: !!q.data?.design,
    queryFn: () => renderIssued(q.data!, domMeasurer()),
    staleTime: Infinity,
  });
  const [busy, setBusy] = useState<Busy>(null);
  const [revoke, setRevoke] = useState(false);
  const [archive, setArchive] = useState(false);
  const d = q.data;
  const p = page.data;

  const run = async (k: Exclude<Busy, null>, fn: () => Promise<unknown>) => {
    setBusy(k);
    try {
      await fn();
    } catch (e) {
      console.warn("[certificates]", k, e);
      toast.error(e instanceof CertError ? e.message : t("certificates.err.generic"), {
        action: { label: t("certificates.retry"), onClick: () => void run(k, fn) },
      });
    } finally {
      setBusy(null);
    }
  };
  const refresh = () => void qc.invalidateQueries({ queryKey: certKeys.all });
  const issuedLike =
    d && (d.status === "issued" || d.status === "revoked" || d.status === "archived");

  return (
    <StudioFrame
      title={t("certificates.view.title")}
      subtitle={d ? `${d.type_name ?? ""} — ${d.student_name}` : undefined}
    >
      {q.isError && <QueryError onRetry={() => void q.refetch()} />}
      {(q.isPending || page.isPending) && !q.isError && (
        <div
          className="flex justify-center py-16"
          role="status"
          aria-label={t("certificates.loading")}
        >
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
      {page.isError && <QueryError onRetry={() => void page.refetch()} />}
      {d && p && (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="rounded-3xl bg-muted/40 p-4 sm:p-8">
            <CertPage
              html={p.html}
              width={p.size.width}
              height={p.size.height}
              maxHeight={720}
              label={p.title}
            />
          </div>
          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <StatusBadge status={d.status} />
                <span className="font-mono text-xs" dir="ltr">
                  {d.certificate_number}
                </span>
              </div>
              <Row k={t("certificates.col.student")} v={d.student_name} />
              <Row k={t("certificates.col.center")} v={d.center_name} />
              <Row k={t("certificates.col.halaqa")} v={d.halaqa_name} />
              <Row k={t("certificates.col.teacher")} v={d.teacher_name} />
              <Row k={t("certificates.col.type")} v={d.type_name} />
              <Row k={t("certificates.col.template")} v={d.template_name} />
              <Row k={t("certificates.col.date")} v={d.issue_date} />
              {d.fingerprint && <Row k={t("certificates.view.fingerprint")} v={d.fingerprint} />}
              {d.issued_at && localDayOf(d.issued_at) !== d.issue_date && (
                <Row k={t("certificates.view.issuedAt")} v={localDayOf(d.issued_at)} />
              )}
              {d.status === "revoked" && (
                <p className="rounded-xl bg-destructive/10 text-destructive p-2 text-xs">
                  {t("certificates.view.revokedOn", { date: (d.revoked_at ?? "").slice(0, 10) })}
                  <br />
                  {t("certificates.view.reason", { reason: d.revoke_reason ?? "" })}
                </p>
              )}
              {d.status === "pending" && (
                <>
                  <PendingReasons
                    reasons={d.snapshot?.approval?.reasons}
                    check={d.snapshot?.server_check}
                  />
                  {d.can_approve ? (
                    <div className="flex gap-2">
                      <ApprovalButtons
                        ids={[d.id]}
                        onDone={() => void qc.invalidateQueries({ queryKey: certKeys.all })}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t("certificates.approval.waitHint")}
                    </p>
                  )}
                </>
              )}
              {d.status === "rejected" && (
                <p className="rounded-xl bg-destructive/10 text-destructive p-2 text-xs">
                  {t("certificates.approval.rejectedNote", { reason: d.review_note ?? "" })}
                </p>
              )}
              {d.approved_at && d.status !== "rejected" && (
                <Row
                  k={t("certificates.approval.approvedBy")}
                  v={`${d.approved_by_name ?? ""} — ${localDayOf(d.approved_at)}`}
                />
              )}
              {d.replaces_id && (
                <Link
                  to="/certificates/$id"
                  params={{ id: d.replaces_id }}
                  className="block text-xs font-bold text-primary"
                >
                  {t("certificates.view.replaces")}
                </Link>
              )}
              {d.replaced_by && (
                <Link
                  to="/certificates/$id"
                  params={{ id: d.replaced_by }}
                  className="block text-xs font-bold text-primary"
                >
                  {t("certificates.view.replacedBy")}
                </Link>
              )}
              {!issuedLike && (
                <p className="text-xs text-muted-foreground">{t("certificates.view.draftNote")}</p>
              )}
              <p className="text-[0.625rem] text-muted-foreground">
                {t("certificates.view.snapshotNote")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SBtn
                tone="primary"
                disabled={!!busy}
                onClick={() =>
                  void run("pdf", () => exportCertificatePdf([p.html], p.size, p.fileBase, p.title))
                }
              >
                {busy === "pdf" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4" />
                )}{" "}
                {t("certificates.view.pdf")}
              </SBtn>
              <SBtn
                disabled={!!busy}
                onClick={() =>
                  void run("png", async () => {
                    const got = await exportCertificatePngOrPdf(
                      p.html,
                      p.size,
                      p.fileBase,
                      p.title,
                    );
                    if (got === "pdf") toast.info(t("certificates.view.pngFallback"));
                  })
                }
              >
                {busy === "png" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ImageIcon className="w-4 h-4" />
                )}{" "}
                {t("certificates.view.png")}
              </SBtn>
              <SBtn
                disabled={!!busy}
                onClick={() =>
                  void run("print", () => printCertificates([p.html], p.size, p.title))
                }
              >
                <Printer className="w-4 h-4" /> {t("certificates.view.print")}
              </SBtn>
              {d.status === "issued" && (
                <Link
                  to="/certificates/ceremony"
                  search={{ ids: d.id }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-bold hover:bg-muted"
                >
                  <Printer className="w-4 h-4" /> {t("certificates.ceremony.preprinted")}
                </Link>
              )}
              <SBtn
                disabled={!!busy || !p.link}
                onClick={() =>
                  void run("share", () =>
                    shareCertificate(p.html, p.size, p.fileBase, p.title, p.shareText),
                  )
                }
              >
                <Share2 className="w-4 h-4" /> {t("certificates.view.share")}
              </SBtn>
              {d.status === "issued" && d.verify_code && <StudioStory d={d} />}
            </div>
            {p.link && d.verify_code && (
              <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
                <p className="text-[0.6875rem] font-bold text-muted-foreground">
                  {t("certificates.view.verifyLink")}
                </p>
                <p className="font-mono text-[0.6875rem] break-all" dir="ltr">
                  {p.link}
                </p>
                <div className="flex gap-2">
                  <SBtn
                    onClick={() =>
                      void navigator.clipboard
                        ?.writeText(p.link!)
                        .then(() => toast.success(t("certificates.view.linkCopied")))
                        .catch(() => toast.error(t("certificates.err.generic")))
                    }
                  >
                    <Copy className="w-4 h-4" /> {t("certificates.view.copyLink")}
                  </SBtn>
                  <Link
                    to="/verify"
                    search={{ code: d.verify_code }}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border border-border"
                  >
                    <ExternalLink className="w-4 h-4" /> {t("certificates.view.openVerify")}
                  </Link>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {d.status === "issued" && d.can_revoke && (
                <SBtn tone="danger" onClick={() => setRevoke(true)}>
                  <Ban className="w-4 h-4" /> {t("certificates.view.revoke")}
                </SBtn>
              )}
              {issuedLike && d.can_issue && !d.replaced_by && (
                <Link
                  to="/certificates/new"
                  search={{ replaces: d.id }}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold bg-gold/15 border border-gold/40"
                >
                  <RefreshCw className="w-4 h-4" /> {t("certificates.view.reissue")}
                </Link>
              )}
              {(d.status === "issued" || d.status === "revoked") && d.can_revoke && (
                <SBtn onClick={() => setArchive(true)} disabled={!!busy}>
                  <Archive className="w-4 h-4" /> {t("certificates.view.archive")}
                </SBtn>
              )}
            </div>
          </aside>
        </div>
      )}
      {revoke && d && (
        <RevokeDialog
          id={d.id}
          number={d.certificate_number}
          name={d.student_name}
          onClose={() => setRevoke(false)}
          onDone={refresh}
        />
      )}
      <ConfirmDialog
        open={archive}
        onOpenChange={setArchive}
        busy={busy === "archive"}
        destructive={false}
        title={t("certificates.view.archive")}
        description={t("certificates.view.archiveHint")}
        confirmLabel={t("certificates.view.archive")}
        cancelLabel={t("certificates.cancel")}
        onConfirm={() =>
          void run("archive", async () => {
            await certApi.archive(id);
            setArchive(false);
            refresh();
          })
        }
      />
    </StudioFrame>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <p className="flex gap-2 text-xs">
      <span className="text-muted-foreground w-20 shrink-0">{k}</span>
      <span className="font-bold break-words min-w-0">{v || "—"}</span>
    </p>
  );
}

/** قالب القصة للشهادة المُصدَرة (1.20.0): 1080×1920 مع QR التحقق، والاسم الأول افتراضياً. */
function StudioStory({ d }: { d: CertDetail }) {
  const t = useT();
  const base = useMemo(
    () => ({
      title: d.type_name ?? t("story.certTitle"),
      body: t("story.studioBody"),
      place: [d.halaqa_name, d.center_name].filter(Boolean).join(" — ") || null,
      date: d.issue_date,
      serial: d.certificate_number,
      verifyCode: d.verify_code,
    }),
    [d, t],
  );
  return (
    <StoryShareButton
      fullName={d.student_name}
      base={base}
      qrPayload={d.verify_code ? verifyLink(d.verify_code) : null}
      fileName={`zen-story-${d.certificate_number ?? d.id}.png`}
      shareText={base.title}
      className="col-span-2 h-10 rounded-xl border border-border bg-card text-sm font-bold text-primary flex items-center justify-center gap-2"
    />
  );
}
