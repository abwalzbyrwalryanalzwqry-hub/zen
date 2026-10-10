import { useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * مشاركة نتيجة الاختبار صورةً (أفكار لاحقة: «تصدير النتيجة صورةً»). تُرسم البطاقة على الجهاز بالمكتبة
 * نفسها لبطاقات الآيات والإنجازات (تُحمَّل عند الطلب)، ولا يُرفع شيء إلى الخادم. لا أسماء ولا تفاصيل
 * أخطاء في الصورة: النسبة والنطاق ومستوى الإتقان فقط.
 */
export function ShareResultButton({
  percentage,
  scope,
  summary,
}: {
  percentage: number;
  scope: string;
  summary: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const share = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { renderMilestoneCard, shareCardImage } = await import("@/lib/quran/share-card");
      const canvas = document.createElement("canvas");
      await renderMilestoneCard(canvas, {
        eyebrow: t("examShare.eyebrow"),
        headline: scope,
        sub: summary,
        figure: Math.round(percentage),
        theme: "emerald",
        size: "square",
      });
      const r = await shareCardImage(
        canvas,
        `zen-exam-${Math.round(percentage)}.png`,
        t("examShare.text", { percent: Math.round(percentage), scope }),
        t("examShare.dialog"),
      );
      if (r === "downloaded") setNote(t("examShare.downloaded"));
    } catch {
      setNote(t("examShare.failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => void share()}
        disabled={busy}
        className="w-full min-h-11 rounded-2xl glass text-primary text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <Share2 className="w-4 h-4" aria-hidden="true" />
        )}
        {t("examShare.button")}
      </button>
      {note && (
        <p role="status" className="text-center text-[0.6875rem] text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}
