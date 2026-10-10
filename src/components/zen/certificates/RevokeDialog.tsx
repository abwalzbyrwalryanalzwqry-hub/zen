import * as Dialog from "@radix-ui/react-dialog";
import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { certApi, CertError } from "@/lib/certificates/api";
import { SBtn } from "./StudioFrame";

/** أسباب شائعة بنقرة (1.22.0)؛ تبقى قابلة للتعديل، والنص الحر متاح. */
const REVOKE_PRESETS = ["nameTypo", "wrongType", "wrongStudent", "wrongDate", "duplicate"] as const;

/** إلغاء شهادة بسبب مكتوب: لا حذف — تبقى في السجل بحالة «ملغاة» مع من ألغاها ومتى ولماذا. */
export function RevokeDialog({
  id,
  number,
  name,
  onClose,
  onDone,
}: {
  id: string;
  number: string | null;
  name: string;
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
      await certApi.revoke(id, reason.trim());
      toast.success(t("certificates.revoke.done"));
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
            {t("certificates.revoke.title")}
          </Dialog.Title>
          <p className="text-sm font-bold">
            {name}{" "}
            <span className="font-mono text-xs text-muted-foreground" dir="ltr">
              {number}
            </span>
          </p>
          <Dialog.Description className="text-xs text-muted-foreground">
            {t("certificates.revoke.hint")}
          </Dialog.Description>
          <label htmlFor={fid} className="block text-[0.6875rem] font-bold text-muted-foreground">
            {t("certificates.revoke.reason")}
          </label>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={t("certificates.revoke.presets")}
          >
            {REVOKE_PRESETS.map((k) => {
              const v = t(`certificates.revoke.preset.${k}`);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={reason === v}
                  onClick={() => setReason(v)}
                  className={`rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold ${reason === v ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                >
                  {v}
                </button>
              );
            })}
          </div>
          <textarea
            id={fid}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 300))}
            placeholder={t("certificates.revoke.reasonPlaceholder")}
            rows={3}
            className="w-full rounded-xl bg-card border border-border p-2 text-sm"
          />
          <div className="flex gap-2 justify-end">
            <SBtn onClick={onClose} disabled={busy}>
              {t("certificates.cancel")}
            </SBtn>
            <SBtn tone="danger" disabled={!ok || busy} onClick={() => void go()}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}{" "}
              {t("certificates.revoke.confirm")}
            </SBtn>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
