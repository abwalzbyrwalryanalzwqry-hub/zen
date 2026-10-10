import { useRouter } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";
import { ChevronRight } from "lucide-react";
import { inAppHistoryIndex } from "@/lib/back-nav";

/**
 * زر رجوع موحَّد لرأس الصفحات: يرجع للصفحة السابقة إن وُجدت داخل التطبيق،
 * وإلا فإلى `fallback` (حين تُفتح الصفحة مباشرة أو من إشعار).
 */
export function BackButton({ fallback = "/today" }: { fallback?: string }) {
  const router = useRouter();
  const t = useT();
  return (
    <button
      type="button"
      aria-label={t("common.back")}
      onClick={() => {
        if (inAppHistoryIndex() > 0) router.history.back();
        else void router.navigate({ to: fallback, replace: true });
      }}
      className="w-9 h-9 shrink-0 rounded-xl glass flex items-center justify-center active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* السهم يشير إلى بداية السطر: يميناً في العربية ويساراً في LTR (I18N-05). */}
      <ChevronRight className="w-4 h-4 text-foreground ltr:rotate-180" aria-hidden="true" />
    </button>
  );
}
