import { AlertTriangle, RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * حالة «تعذّر التحميل» الموحَّدة (تدقيق 1.3): بدل شاشة فارغة توحي بأن البيانات ضاعت. تُستعمل مع
 * `useQuery` (`isError` و`refetch`). الرسالة عامة عمداً: لا تفاصيل تقنية للمستخدم (القاعدة 25).
 */
export function QueryError({
  onRetry,
  compact = false,
}: {
  onRetry: () => void;
  compact?: boolean;
}) {
  const t = useT();
  return (
    <div
      role="alert"
      className={`mx-2 glass rounded-2xl ${compact ? "p-3" : "p-5"} flex flex-col items-center text-center gap-2`}
    >
      <AlertTriangle aria-hidden className="w-5 h-5 text-gold" />
      <p className="text-sm font-medium text-foreground">{t("errors.load.title")}</p>
      {!compact && <p className="text-xs text-muted-foreground">{t("errors.load.hint")}</p>}
      <button
        onClick={onRetry}
        className="min-h-12 mt-1 px-4 rounded-full bg-primary/15 text-primary text-xs font-medium flex items-center gap-1.5"
      >
        <RefreshCw aria-hidden className="w-3.5 h-3.5" /> {t("common.retry")}
      </button>
    </div>
  );
}
