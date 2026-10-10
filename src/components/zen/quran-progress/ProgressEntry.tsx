import { Loader2, NotebookPen, Pencil, Sparkles, Star, Trash2, X } from "lucide-react";
import { timeAgo, type ProgressRow } from "@/lib/zen-api";
import { ayahSpan } from "@/lib/format";
import { useT } from "@/lib/i18n";

/**
 * سطر في «سجل الحفظ»: السورة والمدى والنوع والوقت، وتقييم المعلّم إن وُجد، وزر التقييم الذكي لهذا التسجيل
 * نفسه (يظهر جوابه تحته لا تحت غيره)، وتعديل التسجيل أو حذفه ما لم يُقيَّم.
 */
export function ProgressEntry({
  r,
  index,
  ai,
  onAsk,
  onDismiss,
  onEdit,
  onDelete,
}: {
  r: ProgressRow;
  index: number;
  /** جواب التقييم الذكي لهذا التسجيل، أو null إن لم يُطلب له. */
  ai: { text: string | null; loading: boolean } | null;
  onAsk: () => void;
  onDismiss: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const t = useT();
  const reviewed = r.rating != null;
  const isNew = r.memorization_type === "new";
  return (
    <div
      className="glass rounded-2xl p-3.5 anim-float-in"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            {t("progressLog.entrySurah", { name: r.surah_name })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("progressLog.entryAyat", { span: ayahSpan(r.from_ayah, r.to_ayah) })}
            <span
              className={`ms-1.5 rounded-full px-2 py-0.5 font-bold ${isNew ? "bg-primary/12 text-primary" : "bg-gold/15 text-gold-ink"}`}
            >
              {t(isNew ? "progressLog.new" : "progressLog.revision")}
            </span>
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
      </div>
      {r.notes && (
        <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1">
          <NotebookPen className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          {r.notes}
        </p>
      )}
      {reviewed && (
        <div
          className="mt-2 flex flex-wrap items-center gap-1"
          aria-label={t("progressLog.rated", { n: r.rating ?? 0 })}
        >
          {Array.from({ length: 5 }).map((_, k) => (
            <Star
              key={k}
              aria-hidden="true"
              className={`w-3.5 h-3.5 ${k < (r.rating ?? 0) ? "fill-gold text-gold" : "text-muted-foreground/40"}`}
            />
          ))}
          {r.feedback && <span className="text-xs text-muted-foreground ms-1">— {r.feedback}</span>}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onAsk}
          disabled={ai?.loading}
          className="min-h-11 px-3 rounded-xl glass-strong flex items-center gap-1.5 text-xs text-gold-ink font-bold disabled:opacity-50"
        >
          {ai?.loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          {t("progressLog.askAi")}
        </button>
        {!reviewed && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="min-h-11 px-3 rounded-xl glass flex items-center gap-1.5 text-xs font-bold text-primary"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> {t("progressLog.edit")}
          </button>
        )}
        {!reviewed && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="min-h-11 px-3 rounded-xl glass flex items-center gap-1.5 text-xs font-bold text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> {t("progressLog.delete")}
          </button>
        )}
      </div>

      {ai?.text && (
        <div
          className="mt-2 rounded-xl bg-gold/5 border border-gold/25 p-3 anim-float-in"
          aria-live="polite"
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-gold-ink" aria-hidden="true" />
            <span className="text-xs font-bold text-gold-ink">{t("progressLog.aiTitle")}</span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label={t("common.close")}
              className="ms-auto min-h-11 min-w-11 flex items-center justify-center text-muted-foreground"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">{ai.text}</p>
        </div>
      )}
    </div>
  );
}
