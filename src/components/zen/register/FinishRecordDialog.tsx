import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { finishCheck, type DayStudent } from "@/lib/daily-record";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

const MAX_NAMES = 8;

/**
 * تأكيد «إنهاء سجل اليوم»: النواقص تنبيهات لا تمنع (بلا حضور، حاضر بلا إنجاز، إنجاز بلا تقييم)،
 * والمنع للقاعدة الإلزامية وحدها (لا حضور مسجَّل لأي طالب)، وهي نفسها على الخادم.
 * 1.14.0: نصف شاشة، وأسماء النواقص أزرار تفتح لوحة الطالب مباشرة لإكمال ما نقص.
 */
export function FinishRecordDialog({
  open,
  students,
  busy,
  onClose,
  onConfirm,
  onMarkRestAbsent,
  onOpenStudent,
}: {
  /** لمس اسم في النواقص: يُغلق هذه ويفتح لوحة الطالب. */
  onOpenStudent?: (student: string) => void;
  open: boolean;
  students: readonly DayStudent[];
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** «سجّل الباقين غائبين» (DR-05): لمن لم يُسجَّل حضوره، بنداء واحد. */
  onMarkRestAbsent?: () => void;
}) {
  const t = useT();
  const check = finishCheck(students);
  const unmarked = students.filter((s) => !s.status).length;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <SheetContent
        title={t("dailyRecord.finish.title")}
        snap="auto"
        bodyClassName="space-y-3"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="min-h-12 rounded-2xl glass text-sm font-bold"
            >
              {t("dailyRecord.finish.back")}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy || !!check.blocking}
              className="min-h-12 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {check.warnings.length
                ? t("dailyRecord.finish.confirmAnyway")
                : t("dailyRecord.finish.confirm")}
            </button>
          </div>
        }
      >
        {check.blocking ? (
          <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
            {t(`dailyRecord.finish.blocking.${check.blocking}`)}
          </p>
        ) : check.warnings.length ? (
          <ul className="space-y-2" aria-label={t("dailyRecord.finish.warningsLabel")}>
            {check.warnings.map((w) => (
              <li key={w.kind} className="rounded-xl bg-gold/15 p-2.5 text-xs text-foreground">
                <p className="flex gap-2 font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-gold-ink" aria-hidden="true" />
                  {t(`dailyRecord.finish.warnings.${w.kind}`, { n: w.names.length })}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {w.names.slice(0, MAX_NAMES).map((n, i) =>
                    onOpenStudent ? (
                      <button
                        key={w.ids[i]}
                        type="button"
                        onClick={() => onOpenStudent(w.ids[i])}
                        aria-label={t("dailyRecord.card.open", { name: n })}
                        className="min-h-11 px-3 rounded-full bg-background/80 text-xs font-bold text-foreground"
                      >
                        {n}
                      </button>
                    ) : (
                      <span key={w.ids[i]} className="rounded-full bg-background/80 px-2 py-1">
                        {n}
                      </span>
                    ),
                  )}
                  {w.names.length > MAX_NAMES && (
                    <span className="self-center text-muted-foreground">
                      {t("dailyRecord.finish.more", { n: w.names.length - MAX_NAMES })}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-primary/10 p-3 text-xs text-primary flex gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            {t("dailyRecord.finish.ok")}
          </p>
        )}
        {onMarkRestAbsent && unmarked > 0 && (
          <button
            type="button"
            onClick={onMarkRestAbsent}
            disabled={busy}
            className="min-h-11 rounded-2xl bg-muted/70 text-foreground text-sm font-bold disabled:opacity-50"
          >
            {t("dailyRecord.bulk.restAbsent", { n: unmarked })}
          </button>
        )}
        <p className="text-xs text-muted-foreground">{t("dailyRecord.finish.hint")}</p>
      </SheetContent>
    </Sheet>
  );
}
