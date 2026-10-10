import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { CheckItem } from "@/lib/certificates/validate";

/** نتيجة فحص الشهادة: ✓ سليم، ! تنبيه، ✕ مانع للإصدار. */
export function CheckList({ items, ok, name }: { items: CheckItem[]; ok: boolean; name?: string }) {
  const t = useT();
  return (
    <section aria-label={t("certificates.check.title")} className="space-y-1.5">
      <ul className="space-y-1">
        {items
          .filter((i) => i.key !== "ready")
          .map((i, n) => (
            <li key={`${i.key}-${n}`} className="flex items-start gap-2 text-xs">
              {i.level === "ok" ? (
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-label="✓" />
              ) : i.level === "warn" ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-label="!" />
              ) : (
                <XCircle className="w-4 h-4 text-destructive shrink-0" aria-label="✕" />
              )}
              <span className={i.level === "error" ? "text-destructive font-bold" : ""}>
                {i.text}
              </span>
            </li>
          ))}
      </ul>
      <p
        role="status"
        className={`rounded-xl px-3 py-2 text-xs font-black ${ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}
      >
        {ok ? "✓ " : "✕ "}
        {ok
          ? name
            ? t("certificates.check.studentReady", { name })
            : t("certificates.check.ready")
          : t("certificates.check.blocked")}
      </p>
    </section>
  );
}
