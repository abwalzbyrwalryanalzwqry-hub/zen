import { useQuery } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { QueryError } from "@/components/zen/QueryError";
import { useT } from "@/lib/i18n";
import { fetchDailySheet } from "@/lib/daily-record-api";
import { segmentsText } from "@/lib/daily-record-text";
import { dailyKey } from "@/hooks/use-daily-record";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

const TONE: Record<string, string> = {
  present: "text-primary",
  late: "text-gold-ink",
  absent: "text-destructive",
  excused: "text-excused",
};

/**
 * معاينة يوم سابق في نصف شاشة (1.14.0): من حضر وما حفظ وراجع كل طالب، دون مغادرة «السجلات السابقة».
 * «تعديل» (إن كان اليوم قابلاً للتعديل) يفتحه في «تسجيل اليوم» كما كان.
 */
export function DayPreviewSheet({
  halaqa,
  day,
  title,
  onClose,
  onEdit,
}: {
  halaqa: string;
  day: { date: string; editable: boolean } | null;
  title: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const t = useT();
  const q = useQuery({
    // تحت مفتاح اليوم نفسه: يشارك نسخة «تسجيل اليوم» ويتحدّث معها.
    queryKey: dailyKey(halaqa, day?.date ?? ""),
    enabled: !!day,
    queryFn: () => fetchDailySheet(halaqa, day!.date),
  });
  const students = q.data?.students ?? [];
  return (
    <Sheet open={!!day} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        title={title}
        description={t("dailyRecord.preview.description")}
        bodyClassName="space-y-2"
        footer={
          day?.editable ? (
            <button
              type="button"
              onClick={onEdit}
              className="w-full min-h-12 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-1.5"
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
              {t("dailyRecord.history.edit")}
            </button>
          ) : undefined
        }
      >
        {q.isPending ? (
          <div className="flex justify-center py-8" role="status" aria-label={t("common.loading")}>
            <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
          </div>
        ) : q.isError ? (
          <QueryError onRetry={() => void q.refetch()} />
        ) : (
          <ul className="space-y-1.5" aria-label={t("dailyRecord.studentsLabel")}>
            {students.map((s) => {
              const work = [
                s.memorize &&
                  `${t("dailyRecord.card.memorizedToday")}: ${segmentsText(s.memorize.segments)}`,
                s.review &&
                  `${t("dailyRecord.card.reviewedToday")}: ${segmentsText(s.review.segments)}`,
              ].filter(Boolean);
              return (
                <li key={s.student_id} className="rounded-2xl bg-muted/40 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <p className="flex-1 min-w-0 truncate text-sm font-bold text-foreground">
                      {s.name}
                    </p>
                    <span
                      className={`shrink-0 text-xs font-bold ${s.status ? TONE[s.status] : "text-muted-foreground"}`}
                    >
                      {s.status
                        ? t(`dailyRecord.attendance.${s.status}`)
                        : t("dailyRecord.summary.unmarked")}
                    </span>
                  </div>
                  {(work.length > 0 || s.reason || s.note) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[...work, s.reason, s.note].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
