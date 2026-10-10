import { Lightbulb, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";
import { useFirstUseTip, type TipId } from "@/lib/first-use-tips";

/** تلميح الاستعمال الأول (1.19.0): يُغلق مرة واحدة ولا يعود. */
export function FirstUseTip({ id }: { id: TipId }) {
  usePagesDict();
  const t = useT();
  const [show, dismiss] = useFirstUseTip(id);
  if (!show) return null;
  return (
    <p
      role="note"
      data-tip={id}
      className="rounded-2xl bg-primary/10 ps-3 pe-1 py-1 text-xs text-foreground flex items-center gap-2"
    >
      <Lightbulb className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
      <span className="flex-1 leading-relaxed">{t(`tips.${id}`)}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("tips.dismiss")}
        className="min-h-11 min-w-11 rounded-xl flex items-center justify-center text-muted-foreground"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </p>
  );
}
