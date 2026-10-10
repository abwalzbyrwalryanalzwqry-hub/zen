import { Check, Loader2 } from "lucide-react";
import type { AutoSaveStatus as Status } from "@/hooks/useAutoSave";
import { useT } from "@/lib/i18n";

/** مؤشر «جارٍ الحفظ / حُفظ» يُعلن لقارئ الشاشة دون أن يسرق التركيز. */
export function AutoSaveStatus({ status }: { status: Status }) {
  const t = useT();
  return (
    <span
      role="status"
      aria-live="polite"
      className="text-xs text-muted-foreground min-w-14 text-end"
    >
      {status === "saving" && (
        <span className="inline-flex items-center gap-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          {t("settings.autosave.saving")}
        </span>
      )}
      {status === "saved" && (
        <span className="inline-flex items-center gap-1 text-primary">
          <Check className="w-3.5 h-3.5" aria-hidden="true" />
          {t("settings.autosave.saved")}
        </span>
      )}
    </span>
  );
}
