import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

/**
 * تأكيد بنافذة التطبيق بدل window.confirm (DR-11، DR-12، DR-19): يتبع اتجاه اللغة وسماتها، ويُقرأ لقارئ
 * الشاشة بعنوانه ووصفه، وزر الإلغاء أولاً (التركيز الافتراضي على الأقل ضرراً).
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className="max-w-sm rounded-3xl bg-card p-4 gap-3">
        <DialogHeader className="text-start px-8">
          <DialogTitle className="text-base font-black">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{body}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            disabled={busy}
            className="min-h-12 rounded-2xl glass text-sm font-bold"
          >
            {t("dailyRecord.confirm.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`min-h-12 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 ${
              destructive
                ? "bg-destructive text-destructive-foreground"
                : "gradient-primary text-primary-foreground"
            }`}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
