import { useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import type { AttendanceStatus, DayStudent } from "@/lib/daily-record";
import type { EntryPayload } from "@/lib/daily-record-api";
import type { SaveOutcome } from "@/hooks/use-daily-record";
import { StudentBody, type StudentNav, type SubView } from "./StudentBody";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

export type { StudentNav, SubView } from "./StudentBody";

/**
 * لوحة الطالب في نصف شاشة (1.14.0): الحفظ والمراجعة والتقييم والملاحظة، **تُحفظ تلقائياً** بعد توقّف
 * التعديل (بلا زر «حفظ»؛ بلا اتصال تُحفظ على الجهاز وتُرسل لاحقاً). السابق/التالي في الرأس وبالسحب أفقياً،
 * و«التالي» يتخطّى الغائب والمستأذن. الإغلاق يحفظ ما اكتمل؛ وما لم يكتمل يُسأل عن تجاهله.
 */
export function StudentDayDialog({
  student,
  writable,
  onClose,
  onSave,
  onReason,
  nav,
}: {
  student: DayStudent | null;
  writable: boolean;
  onClose: () => void;
  onSave: (student: string, payload: EntryPayload) => Promise<SaveOutcome>;
  /** حفظ سبب الغياب أو الاستئذان ("" يمسحه). */
  onReason?: (student: string, status: AttendanceStatus, reason: string) => Promise<boolean>;
  nav?: StudentNav | null;
}) {
  const t = useT();
  const [view, setView] = useState<SubView | null>(null);
  const [viewFor, setViewFor] = useState(student?.student_id ?? null);
  if ((student?.student_id ?? null) !== viewFor) {
    setViewFor(student?.student_id ?? null);
    setView(null);
  }
  const closeRef = useRef<(() => void) | null>(null);
  const navRef = useRef<((go: () => void) => void) | null>(null);
  const go = (fn: (() => void) | null | undefined) => {
    if (!fn) return;
    const leave = navRef.current;
    if (leave) leave(fn);
    else fn();
  };
  const arrow =
    "min-h-11 min-w-11 rounded-full flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-30";
  return (
    <Sheet
      open={!!student}
      onOpenChange={(o) => {
        if (o) return;
        // الرجوع وEscape في العرض الفرعي يعيدان إلى اللوحة لا يغلقانها.
        if (view) return setView(null);
        const close = closeRef.current;
        if (close) close();
        else onClose();
      }}
    >
      {student && (
        <SheetContent
          forceExpanded={view?.type === "mushaf"}
          title={
            view
              ? t(view.type === "mushaf" ? "dailyRecord.mushaf.title" : "surahPicker.title")
              : student.name
          }
          description={
            view
              ? undefined
              : [
                  student.status
                    ? t(`dailyRecord.attendance.${student.status}`)
                    : t("dailyRecord.summary.unmarked"),
                  !writable ? t("dailyRecord.detail.readOnly") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
          }
          headerExtra={
            view ? (
              <button
                type="button"
                className={arrow}
                onClick={() => setView(null)}
                aria-label={t("dailyRecord.subview.back", { name: student.name })}
              >
                <ArrowRight className="w-5 h-5 ltr:rotate-180" aria-hidden="true" />
              </button>
            ) : nav && nav.total > 1 ? (
              <div
                className="flex items-center"
                role="group"
                aria-label={t("dailyRecord.nav.label")}
              >
                <button
                  type="button"
                  className={arrow}
                  disabled={!nav.onPrev}
                  onClick={() => go(nav.onPrev)}
                  aria-label={t("dailyRecord.nav.prev")}
                >
                  <ChevronRight className="w-5 h-5 ltr:rotate-180" aria-hidden="true" />
                </button>
                <span className="text-xs font-bold tabular-nums text-muted-foreground">
                  {t("dailyRecord.nav.position", { i: nav.index + 1, n: nav.total })}
                </span>
                <button
                  type="button"
                  className={arrow}
                  disabled={!nav.onNext}
                  onClick={() => go(nav.onNext)}
                  aria-label={t("dailyRecord.nav.next")}
                >
                  <ChevronLeft className="w-5 h-5 ltr:rotate-180" aria-hidden="true" />
                </button>
              </div>
            ) : null
          }
          bodyClassName="space-y-3"
        >
          <StudentBody
            key={student.student_id}
            student={student}
            writable={writable}
            onClose={onClose}
            onSave={onSave}
            onReason={onReason}
            nav={nav ?? null}
            closeRef={closeRef}
            navRef={navRef}
            view={view}
            setView={setView}
          />
        </SheetContent>
      )}
    </Sheet>
  );
}
