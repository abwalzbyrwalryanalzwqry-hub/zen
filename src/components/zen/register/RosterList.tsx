import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownUp, CheckSquare, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { isMember, type AttendanceStatus, type DayStudent } from "@/lib/daily-record";
import { haptic, STUDENT_SORTS, type StudentSort } from "@/lib/daily-record-assist";
import { StudentDayCard } from "./StudentDayCard";
import { useLatest } from "@/hooks/use-latest";
import { lastReason } from "@/lib/last-reason";
import { FirstUseTip } from "@/components/zen/common/FirstUseTip";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

const REASONS = ["sick", "travel", "family"] as const;
const BULK: readonly AttendanceStatus[] = ["present", "late", "absent", "excused"];
type Change = { student: string; status: AttendanceStatus | null };
/** صفوف الرسم الأول (1.17.0): ما يملأ الشاشة وزيادة؛ والبقية في الإطار التالي دون حجب اللمس. */
export const FIRST_PAINT_ROWS = 14;

/**
 * قائمة طلاب السجل (1.14.0):
 * - ترتيب محفوظ لكل حلقة (ترتيب الحلقة، الاسم، من لم يُسجَّل أولاً، الأكثر غياباً).
 * - السحب على الصف غائب/مستأذن مع «تراجع»، والاستئذان يسأل عن السبب في نصف شاشة صغيرة (أو «تخطٍّ»).
 * - الضغط المطوّل أو «تحديد» يبدأ التحديد المتعدد، وشريط سفلي يطبّق الحالة على المحدَّدين مع «تراجع».
 * - مؤشّر «لم يُرسل» على كل صف له شيء في الصندوق، واهتزاز خفيف يؤكّد اللمسات.
 */
export function RosterList({
  sort,
  onSort,
  students,
  writable,
  pending,
  onAttendance,
  onOpen,
  onBulk,
  onReason,
}: {
  sort: StudentSort;
  onSort: (m: StudentSort) => void;
  /** مرتّبة ومصفّاة. */
  students: readonly DayStudent[];
  writable: boolean;
  pending: ReadonlySet<string>;
  onAttendance: (student: string, status: AttendanceStatus | null) => void;
  onOpen: (student: string) => void;
  onBulk: (changes: Change[]) => Promise<Change[] | null | undefined>;
  onReason: (student: string, status: AttendanceStatus, reason: string) => unknown;
}) {
  const t = useT();
  const [sortOpen, setSortOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  // رسم تدريجي (1.17.0، docs/PERFORMANCE.md): حلقة من 40 طالباً كانت تُرسم دفعة واحدة قبل أن يظهر شيء.
  // الآن أول FIRST_PAINT_ROWS صفاً فوراً، والباقي بعد أول إطار بأولوية منخفضة. مرة واحدة لكل فتح للشاشة.
  const [all, setAll] = useState(false);
  const hasRows = students.length > 0;
  useEffect(() => {
    if (all || !hasRows) return;
    const id = requestAnimationFrame(() => startTransition(() => setAll(true)));
    return () => cancelAnimationFrame(id);
  }, [all, hasRows]);
  const list = all ? students : students.slice(0, FIRST_PAINT_ROWS);
  const byId = useMemo(() => new Map(students.map((s) => [s.student_id, s])), [students]);
  const selecting = selected !== null;
  // أداء (1.16.0): المعالجات ثابتة فلا يُعاد رسم كل البطاقات عند تغيّر طالب واحد؛ تقرأ الأحدث من مرجع.
  const latest = useLatest({ byId, onAttendance, t, selecting });

  const setSort = (m: StudentSort) => {
    onSort(m);
    setSortOpen(false);
  };
  const needsReason = useCallback(
    (student: string) => {
      const s = latest.current.byId.get(student);
      return !s?.reason && !s?.memorize && !s?.review;
    },
    [latest],
  );
  const mark = useCallback(
    (student: string, status: AttendanceStatus | null) => {
      const { byId, onAttendance, t } = latest.current;
      haptic();
      onAttendance(student, status);
      // لمسة «مستأذن» لا تقطع التنقّل بالأسهم بنافذة: السبب من الإشعار إن أراده المعلّم.
      if (status === "excused" && needsReason(student))
        toast(t("dailyRecord.swipe.excused", { name: byId.get(student)?.name ?? "" }), {
          action: { label: t("dailyRecord.reasonSheet.add"), onClick: () => setReasonFor(student) },
        });
    },
    [latest, needsReason],
  );
  const onSwipe = useCallback(
    (student: string, status: "absent" | "excused") => {
      const { byId, onAttendance, t } = latest.current;
      const s = byId.get(student);
      if (!s || s.status === status) return;
      const prev = s.status;
      haptic();
      onAttendance(student, status);
      // السحب إلى «مستأذن» يسأل عن السبب مباشرة في نصف شاشة صغيرة (أو «تخطٍّ»).
      if (status === "excused" && needsReason(student)) setReasonFor(student);
      toast(t(`dailyRecord.swipe.${status}`, { name: s.name }), {
        action: { label: t("dailyRecord.bulk.undo"), onClick: () => onAttendance(student, prev) },
      });
    },
    [latest, needsReason],
  );
  const toggle = useCallback((student: string) => {
    haptic();
    setSelected((cur) => {
      const next = new Set(cur ?? []);
      if (next.has(student)) next.delete(student);
      else next.add(student);
      return next;
    });
  }, []);
  const select = useCallback(
    (id: string) => (latest.current.selecting ? toggle(id) : setSelected(new Set([id]))),
    [latest, toggle],
  );
  const applyBulk = async (status: AttendanceStatus) => {
    const ids = [...(selected ?? [])].filter((id) => {
      const s = byId.get(id);
      if (!s || !isMember(s) || s.status === status) return false;
      // الغياب يحذف إنجاز اليوم: لا يُطبَّق جماعياً على من له إنجاز (يُسأل عنه وحده).
      return !((status === "absent" || status === "excused") && (s.memorize || s.review));
    });
    const kept = (selected?.size ?? 0) - ids.length;
    setSelected(null);
    if (!ids.length) {
      if (kept) toast.message(t("dailyRecord.select.skipped", { n: kept }));
      return;
    }
    haptic(20);
    const undo = await onBulk(ids.map((student) => ({ student, status })));
    if (!undo?.length) return;
    toast.success(
      t("dailyRecord.select.done", {
        n: undo.length,
        status: t(`dailyRecord.attendance.${status}`),
      }),
      { action: { label: t("dailyRecord.bulk.undo"), onClick: () => void onBulk(undo) } },
    );
  };
  const reasonStudent = reasonFor ? byId.get(reasonFor) : null;
  // 1.19.0: آخر سبب سُجّل لهذا الطالب على الجهاز يظهر أولاً (ما لم يكن أحد الأسباب الجاهزة نفسها).
  const prevReason = (() => {
    const r = reasonFor ? lastReason(reasonFor) : null;
    return r && !REASONS.some((x) => t(`dailyRecord.reason.${x}`) === r) ? r : null;
  })();
  const chip = "shrink-0 min-h-11 px-3 rounded-full text-xs font-bold flex items-center gap-1";

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSortOpen(true)}
          aria-haspopup="dialog"
          className={`${chip} bg-muted/60 text-foreground`}
        >
          <ArrowDownUp className="w-4 h-4" aria-hidden="true" />
          {t("dailyRecord.sort.button", { mode: t(`dailyRecord.sort.${sort}`) })}
        </button>
        <span className="flex-1" />
        {writable && (
          <button
            type="button"
            aria-pressed={selecting}
            onClick={() => setSelected(selecting ? null : new Set())}
            className={`${chip} ${selecting ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground"}`}
          >
            <CheckSquare className="w-4 h-4" aria-hidden="true" />
            {t("dailyRecord.select.button")}
          </button>
        )}
      </div>
      {writable && !selecting && list.length > 0 && <FirstUseTip id="swipe" />}
      <ul className="space-y-1.5" aria-label={t("dailyRecord.studentsLabel")}>
        {list.map((s) => (
          <StudentDayCard
            key={s.student_id}
            s={s}
            writable={writable && isMember(s)}
            pending={pending.has(s.student_id)}
            selecting={selecting}
            selected={!!selected?.has(s.student_id)}
            onAttendance={mark}
            onOpen={onOpen}
            onSelect={writable && isMember(s) ? select : undefined}
            onSwipe={onSwipe}
          />
        ))}
      </ul>
      {selecting && (
        <div
          role="toolbar"
          aria-label={t("dailyRecord.select.toolbar", { n: selected.size })}
          className="sticky bottom-0 z-10 -mx-3 border-t border-border/60 bg-background/95 px-3 pt-2 pb-3 backdrop-blur space-y-2"
        >
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm font-bold text-foreground tabular-nums" aria-live="polite">
              {t("dailyRecord.select.count", { n: selected.size })}
            </p>
            <button
              type="button"
              onClick={() =>
                setSelected(new Set(students.filter(isMember).map((s) => s.student_id)))
              }
              className={`${chip} bg-muted/60 text-foreground`}
            >
              {t("dailyRecord.select.all")}
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label={t("dailyRecord.select.cancel")}
              className="min-h-11 min-w-11 rounded-full bg-muted/60 flex items-center justify-center"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {BULK.map((st) => (
              <button
                key={st}
                type="button"
                disabled={!selected.size}
                onClick={() => void applyBulk(st)}
                className="min-h-11 rounded-xl bg-muted/70 text-xs font-bold text-foreground disabled:opacity-40"
              >
                {t(`dailyRecord.attendance.${st}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      <Sheet open={sortOpen} onOpenChange={setSortOpen}>
        <SheetContent title={t("dailyRecord.sort.title")} snap="auto">
          <ul className="grid gap-1.5" role="list">
            {STUDENT_SORTS.map((m) => (
              <li key={m}>
                <button
                  type="button"
                  aria-current={m === sort ? "true" : undefined}
                  onClick={() => setSort(m)}
                  className={`w-full min-h-12 rounded-2xl px-3 text-start text-sm font-bold ${
                    m === sort ? "bg-primary/12 text-primary" : "bg-muted/50 text-foreground"
                  }`}
                >
                  {t(`dailyRecord.sort.${m}`)}
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
      <Sheet open={!!reasonStudent} onOpenChange={(o) => !o && setReasonFor(null)}>
        <SheetContent
          title={t("dailyRecord.reasonSheet.title", { name: reasonStudent?.name ?? "" })}
          snap="auto"
        >
          <div className="flex flex-wrap gap-1.5">
            {prevReason && (
              <button
                type="button"
                data-last-reason
                onClick={() => {
                  if (reasonFor) void onReason(reasonFor, "excused", prevReason);
                  setReasonFor(null);
                }}
                className={`${chip} bg-primary/15 text-primary`}
              >
                {t("dailyRecord.reasonSheet.last", { reason: prevReason })}
              </button>
            )}
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  if (reasonFor) void onReason(reasonFor, "excused", t(`dailyRecord.reason.${r}`));
                  setReasonFor(null);
                }}
                className={`${chip} bg-muted/60 text-foreground`}
              >
                {t(`dailyRecord.reason.${r}`)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setReasonFor(null)}
              className={`${chip} text-muted-foreground`}
            >
              {t("dailyRecord.reasonSheet.skip")}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
