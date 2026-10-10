import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";

/** نسخ نص (رمز دعوة، معرّف) إلى الحافظة برسالة نجاح أو فشل (تحليل «المزيد» GAP-10). */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      toast.success(t("common.copied"));
      setTimeout(() => setDone(false), 2000);
    } catch {
      toast.error(t("common.copyFailed"));
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={label ?? t("common.copy")}
      className="min-w-11 min-h-11 rounded-xl glass flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary"
    >
      {done ? (
        <Check className="w-4 h-4 text-primary" aria-hidden="true" />
      ) : (
        <Copy className="w-4 h-4 text-foreground" aria-hidden="true" />
      )}
    </button>
  );
}
