import * as Dialog from "@radix-ui/react-dialog";
import { useId, useState } from "react";
import { Check, Loader2, ShieldAlert, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { certApi, CertError } from "@/lib/certificates/api";
import type { ApprovalReason, ServerCheck } from "@/lib/certificates/api";
import { SBtn } from "./StudioFrame";

/**
 * اعتماد المدير (1.24.0، قرار صاحب المشروع 2): ما يصدره غير المدير خارج الشروط، أو بتوقيع غيره، أو في مركز
 * يشترط الاعتماد، ينتظر هنا بلا رقم. الاعتماد يمنح الرقم ويُشعر الطالب؛ الردّ بسبب يُشعر المُصدِر.
 */
function useApproval(onDone: () => void) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const approve = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    try {
      await certApi.approve(ids);
      toast.success(t("certificates.approval.approved", { count: ids.length }));
      onDone();
    } catch (e) {
      toast.error(e instanceof CertError ? e.message : t("certificates.err.generic"));
    } finally {
      setBusy(false);
    }
  };
  return { busy, approve };
}

export function RejectDialog({
  ids,
  onClose,
  onDone,
}: {
  ids: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const fid = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = reason.trim().length >= 3;
  const go = async () => {
    setBusy(true);
    try {
      await certApi.reject(ids, reason.trim());
      toast.success(t("certificates.approval.rejected", { count: ids.length }));
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof CertError ? e.message : t("certificates.err.generic"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog.Root open onOpenChange={(o) => !o && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60" />
        <Dialog.Content
          dir="rtl"
          className="fixed z-[60] inset-x-4 top-[15vh] mx-auto max-w-md rounded-3xl bg-background p-5 space-y-3 shadow-2xl"
        >
          <Dialog.Title className="text-base font-black">
            {t("certificates.approval.rejectTitle", { count: ids.length })}
          </Dialog.Title>
          <Dialog.Description className="text-xs text-muted-foreground">
            {t("certificates.approval.rejectHint")}
          </Dialog.Description>
          <label htmlFor={fid} className="block text-[0.6875rem] font-bold text-muted-foreground">
            {t("certificates.revoke.reason")}
          </label>
          <textarea
            id={fid}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 300))}
            rows={3}
            className="w-full rounded-xl bg-card border border-border p-2 text-sm"
          />
          <div className="flex gap-2 justify-end">
            <SBtn onClick={onClose} disabled={busy}>
              {t("certificates.cancel")}
            </SBtn>
            <SBtn tone="danger" disabled={!ok || busy} onClick={() => void go()}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}{" "}
              {t("certificates.approval.reject")}
            </SBtn>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** زرّا اعتماد/ردّ لصف واحد (الجدول) أو لعدة صفوف (شريط التحديد). */
export function ApprovalButtons({
  ids,
  onDone,
  compact = false,
}: {
  ids: string[];
  onDone: () => void;
  compact?: boolean;
}) {
  const t = useT();
  const { busy, approve } = useApproval(onDone);
  const [rejecting, setRejecting] = useState(false);
  const cls = compact
    ? "p-1.5 rounded-lg"
    : "inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold";
  return (
    <>
      <button
        type="button"
        disabled={busy || !ids.length}
        onClick={() => void approve(ids)}
        className={`${cls} bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40`}
        aria-label={t("certificates.approval.approve")}
        title={t("certificates.approval.approve")}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {!compact && t("certificates.approval.approve")}
      </button>
      <button
        type="button"
        disabled={busy || !ids.length}
        onClick={() => setRejecting(true)}
        className={`${cls} text-destructive hover:bg-destructive/10 disabled:opacity-40`}
        aria-label={t("certificates.approval.reject")}
        title={t("certificates.approval.reject")}
      >
        <X className="w-4 h-4" />
        {!compact && t("certificates.approval.reject")}
      </button>
      {rejecting && <RejectDialog ids={ids} onClose={() => setRejecting(false)} onDone={onDone} />}
    </>
  );
}

/** لماذا تنتظر؟ أسباب الخادم وفحصه للشروط، بلغة المستخدم. */
export function PendingReasons({
  reasons,
  check,
}: {
  reasons?: ApprovalReason[] | null;
  check?: ServerCheck | null;
}) {
  const t = useT();
  const failed = (check?.checks ?? []).filter((c) => c.ok === false);
  return (
    <div className="rounded-2xl border border-gold/40 bg-gold/10 p-3 text-sm space-y-1">
      <p className="font-black flex items-center gap-1.5">
        <ShieldAlert className="w-4 h-4" /> {t("certificates.approval.pendingTitle")}
      </p>
      <ul className="list-disc ps-5 text-xs space-y-0.5">
        {(reasons ?? []).map((r) => (
          <li key={r}>{t(`certificates.approval.reason.${r}`)}</li>
        ))}
        {failed.map((c) => (
          <li key={c.kind} className="text-muted-foreground">
            {t(`certificates.cond.${c.kind}`, { need: c.need ?? "", actual: c.actual ?? 0 })}
          </li>
        ))}
      </ul>
    </div>
  );
}
