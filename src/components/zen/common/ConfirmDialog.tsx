import * as Dialog from "@radix-ui/react-dialog";
import { useRef, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * تأكيد موحَّد للإجراءات الخطرة (تحليل «المزيد» A11Y-02/A11Y-07/SEC-07) بدل `window.confirm`:
 * مترجَم ويتبع السمة، و`alertdialog` بتركيز محبوس ويُغلق بـ Escape، والتركيز الأول على «إلغاء»
 * كي لا يُنفَّذ الإجراء الخطر بضغطة Enter عارضة.
 */
export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  busy = false,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = true,
}: ConfirmOptions & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const t = useT();
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          role="alertdialog"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancelRef.current?.focus();
          }}
          className="fixed z-50 inset-x-4 bottom-6 mx-auto max-w-sm glass-strong rounded-3xl p-5 space-y-3 shadow-xl focus:outline-none"
        >
          <Dialog.Title className="text-base font-black text-foreground">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="text-sm text-muted-foreground leading-relaxed">
              {description}
            </Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              ref={cancelRef}
              type="button"
              disabled={busy}
              onClick={() => onOpenChange(false)}
              className="min-h-11 rounded-2xl glass text-sm font-bold text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              {cancelLabel ?? t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={busy}
              aria-busy={busy}
              onClick={onConfirm}
              className={`min-h-11 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 ${
                destructive
                  ? "bg-destructive/15 text-destructive"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {confirmLabel ?? t("common.confirm")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
