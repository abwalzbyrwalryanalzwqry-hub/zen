import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, CloudOff, Lock, ShieldX, Users } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { PageHeader } from "@/components/zen/common/PageHeader";
import { EmptyState } from "@/components/zen/common/EmptyState";
import { QueryError } from "@/components/zen/QueryError";
import { RosterList } from "@/components/zen/register/RosterList";
import { useStudentSort } from "@/hooks/use-student-sort";
import { sortStudents } from "@/lib/daily-record-assist";
import { StudentDayDialog } from "@/components/zen/register/StudentDayDialog";
import { FinishRecordDialog } from "@/components/zen/register/FinishRecordDialog";
import { DailyRecordHeader } from "@/components/zen/register/DailyRecordHeader";
import { RosterTools } from "@/components/zen/register/RosterTools";
import { ConfirmDialog } from "@/components/zen/register/ConfirmDialog";
import { RecordBar } from "@/components/zen/register/RecordActions";
import { AchievementTab } from "@/components/zen/register/AchievementTab";
import {
  RecordHistory,
  RegisterTabs,
  type RegisterView,
} from "@/components/zen/register/RecordHistory";
import { useSession } from "@/hooks/useSession";
import { useDailyRecord, dailyErrorText, isNetworkFailure } from "@/hooks/use-daily-record";
import { intlLocale, useT, t as tt } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { shareText } from "@/lib/app-share";
import { daySummaryText } from "@/lib/daily-record-text";
import { gregorianDate } from "@/lib/muhasaba/dates";
import { listHalaqat } from "@/lib/zen-api";
import { localDayKey } from "@/lib/local-day";
import {
  STUDENT_FILTERS,
  dailyErrorCode,
  filterStudents,
  inEditWindow,
  isMember,
  isWritable,
  stepStudentId,
  type AttendanceStatus,
  type StudentFilter,
} from "@/lib/daily-record";
import { fetchDailyWeek } from "@/lib/daily-record-api";
import { useNow } from "@/hooks/useNow";
import { useLatest } from "@/hooks/use-latest";
import { flushRegisterOutbox, readRegisterOutbox } from "@/lib/halaqa-register";
import { useRegisterDict } from "@/lib/register-i18n";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** السجل اليومي للحلقة (امتداد «سجل الحلقة» 9.1): /teacher/register?halaqa=&date= */
// تبويب التدقيق (1.18.0) يُحمَّل عند فتحه فقط: لا يثقل فتح السجل اليومي.
const RecordAuditTab = lazy(() =>
  import("@/components/zen/register/RecordAuditTab").then((m) => ({ default: m.RecordAuditTab })),
);
export const Route = createFileRoute("/_authed/teacher_/register")({
  head: () => ({ meta: [{ title: `${tt("dailyRecord.title")} — Zen` }] }),
  validateSearch: (
    s: Record<string, unknown>,
  ): { halaqa?: string; date?: string; view?: RegisterView } => ({
    halaqa: typeof s.halaqa === "string" && s.halaqa ? s.halaqa : undefined,
    date: typeof s.date === "string" && DAY.test(s.date) ? s.date : undefined,
    view:
      s.view === "history" || s.view === "achievement" || s.view === "audit" ? s.view : undefined,
  }),
  component: DailyRecordScreen,
});

function DailyRecordScreen() {
  useRegisterDict();
  const t = useT();
  const { userId } = useSession();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const halaqat = useQuery({
    queryKey: ["register-halaqat", userId],
    enabled: !!userId,
    queryFn: () => listHalaqat(),
  });
  const mine = useMemo(
    () =>
      (halaqat.data ?? [])
        .filter((h) => h.teacher_id === userId)
        .concat((halaqat.data ?? []).filter((h) => h.teacher_id !== userId)),
    [halaqat.data, userId],
  );
  const now = useNow();
  // «اليوم» من الخادم (zen_today بمنطقة المستخدم، DR-29) متى عُرف، لا من ساعة الجهاز وحدها.
  const [serverToday, setServerToday] = useState<string | null>(null);
  const today = serverToday ?? localDayKey(new Date(now));
  // الحلقة واليوم في الرابط (DR-08): الرجوع والمشاركة وإعادة التحميل تعيد الشاشة نفسها.
  const halaqa = search.halaqa ?? mine[0]?.id ?? "";
  const date = search.date && inEditWindow(search.date, today) ? search.date : today;
  const [openId, setOpenId] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StudentFilter>("all");
  const [locking, setLocking] = useState(false);
  // غياب طالب له إنجاز اليوم: يُسأل قبل حذف الإنجاز (DR-11)، بدل رفض الخادم HAS_ACHIEVEMENT.
  const [awayAsk, setAwayAsk] = useState<{ student: string; status: AttendanceStatus } | null>(
    null,
  );
  const [awayBusy, setAwayBusy] = useState(false);
  const [announce, setAnnounce] = useState("");
  const go = useCallback(
    (next: { halaqa?: string; date?: string; view?: RegisterView }) => {
      setOpenId(null);
      void navigate({
        search: (s) => ({
          ...s,
          view: undefined,
          ...next,
          date: (next.date ?? s.date) === today ? undefined : (next.date ?? s.date),
        }),
        replace: true,
      });
    },
    [navigate, today],
  );

  const day = useDailyRecord(halaqa, date);
  const week = useQuery({
    // تحت مفتاح السجل نفسه: كل تحديث للسجل يحدّث شريط الأيام.
    queryKey: ["daily-record", halaqa, date, "week"],
    enabled: !!halaqa && !!date,
    queryFn: () => fetchDailyWeek(halaqa, date),
  });
  const sheet = day.sheet.data;
  // معروض من الجهاز: نسخة الجهاز (DR-10)، أو آخر بيانات في الذاكرة فشل تحديثها لانقطاع الاتصال.
  const offlineAt =
    sheet?.cached_at ??
    (sheet && day.sheet.isRefetchError && isNetworkFailure(day.sheet.error)
      ? new Date(day.sheet.dataUpdatedAt).toISOString()
      : null);
  if (sheet?.today && !sheet.cached_at && sheet.today !== serverToday) setServerToday(sheet.today);
  const writable = isWritable(sheet);
  const status = sheet?.record?.status ?? null;
  const [sort, setSort] = useStudentSort(halaqa);
  const visible = useMemo(
    () => sortStudents(filterStudents(sheet?.students ?? [], filter, query), sort),
    [sheet?.students, filter, query, sort],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        STUDENT_FILTERS.map((f) => [f, filterStudents(sheet?.students ?? [], f).length]),
      ) as Record<StudentFilter, number>,
    [sheet?.students],
  );
  const unmarked = counts.unmarked;
  const opened = sheet?.students.find((s) => s.student_id === openId) ?? null;
  const nextId = openId ? stepStudentId(visible, openId, 1) : null;
  const prevId = openId ? stepStudentId(visible, openId, -1) : null;
  const openIndex = openId ? visible.findIndex((s) => s.student_id === openId) : -1;
  const onOpen = useCallback((id: string) => setOpenId(id), []);
  const { setAttendance, bulkAttendance } = day;
  const students = sheet?.students;
  // ثابت عبر التغييرات (أداء 1.16.0): يقرأ أحدث قائمة من مرجع فلا تُرسم البطاقات كلها مع كل لمسة.
  const studentsRef = useLatest(students);
  const onAttendance = useCallback(
    (student: string, st: AttendanceStatus | null) => {
      const s = studentsRef.current?.find((x) => x.student_id === student);
      if ((st === "absent" || st === "excused") && (s?.memorize || s?.review)) {
        setAwayAsk({ student, status: st });
        return;
      }
      // إعلان لقارئ الشاشة (DR-23): اللمسة تغيّر الحالة بلا نافذة ولا إشعار.
      setAnnounce(
        tt("dailyRecord.announce.attendance", {
          name: s?.name ?? "",
          status: st ? tt(`dailyRecord.attendance.${st}`) : tt("dailyRecord.summary.unmarked"),
        }),
      );
      void setAttendance(student, st);
    },
    [studentsRef, setAttendance],
  );
  const confirmAway = async () => {
    if (!awayAsk) return;
    setAwayBusy(true);
    try {
      await day.saveEntry(awayAsk.student, { memorize: null, review: null });
      await setAttendance(awayAsk.student, awayAsk.status);
      setAwayAsk(null);
    } catch (e) {
      toast.error(dailyErrorText(e));
    } finally {
      setAwayBusy(false);
    }
  };
  const awayName = students?.find((x) => x.student_id === awayAsk?.student)?.name ?? "";

  /** حضور جماعي مع «تراجع» في الإشعار (DR-05). */
  const bulk = async (status: AttendanceStatus, msg: string) => {
    const ids = (sheet?.students ?? [])
      .filter((s) => !s.status && isMember(s))
      .map((s) => s.student_id);
    const undo = await bulkAttendance(ids.map((student) => ({ student, status })));
    if (!undo?.length) return;
    toast.success(t(msg, { n: undo.length }), {
      action: {
        label: t("dailyRecord.bulk.undo"),
        onClick: () => void bulkAttendance(undo),
      },
    });
  };

  // ما بقي في صندوق «سجل الحلقة» القديم يُرسل كما كان (ضمن سجل اليوم المفتوح على الخادم).
  useEffect(() => {
    if (!readRegisterOutbox().length) return;
    void flushRegisterOutbox().then((r) => {
      if (r.sent) void qc.invalidateQueries({ queryKey: ["daily-record"] });
      if (r.rejected.length) toast.error(dailyErrorText(new Error(r.rejected[0].message)));
    });
  }, [qc]);

  const sheetError = day.sheet.isError ? dailyErrorCode(day.sheet.error) : null;
  const denied = sheetError === "NOT_YOUR_HALAQA";
  const shareDay = async () => {
    if (!sheet) return;
    const r = await shareText(
      t("dailyRecord.title"),
      daySummaryText(sheet, gregorianDate(sheet.date)),
    );
    if (r === "copied") toast.success(t("dailyRecord.share.copied"));
    else if (r === "failed") toast.error(t("dailyRecord.share.failed"));
  };
  const finish = async () => {
    if (await day.complete()) {
      setFinishing(false);
      toast.success(t("dailyRecord.finish.done"));
    }
  };

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <PageHeader title={t("dailyRecord.title")} back="/teacher" />
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2.5">
          <p className="sr-only" role="status" aria-live="polite">
            {announce}
          </p>
          {offlineAt && (
            <p
              role="status"
              className="rounded-2xl bg-muted/70 px-3 py-2 text-xs font-bold text-foreground flex items-center gap-1.5"
            >
              <CloudOff className="w-3.5 h-3.5" aria-hidden="true" />
              {sheet?.local_day
                ? t("dailyRecord.localDay")
                : t("dailyRecord.cached", {
                    time: new Intl.DateTimeFormat(intlLocale(), {
                      hour: "numeric",
                      minute: "2-digit",
                      day: "numeric",
                      month: "short",
                    }).format(new Date(offlineAt)),
                  })}
            </p>
          )}
          {day.queued > 0 && (
            <p
              role="status"
              className="rounded-2xl bg-gold/15 px-3 py-2 text-xs font-bold text-gold-ink flex items-center gap-1.5"
            >
              <CloudOff className="w-3.5 h-3.5" aria-hidden="true" />
              {t("dailyRecord.outbox.pending", { n: day.queued })}
            </p>
          )}
          {mine.length > 0 && (
            <RegisterTabs
              view={search.view}
              onChange={(v) => go({ view: v, date: v ? undefined : date })}
            />
          )}
          {search.view === "achievement" && mine.length > 0 ? (
            <AchievementTab halaqa={halaqa} today={today} />
          ) : search.view === "audit" && mine.length > 0 ? (
            <Suspense fallback={null}>
              <RecordAuditTab halaqa={halaqa} onOpenDay={(d) => go({ date: d })} />
            </Suspense>
          ) : search.view === "history" && mine.length > 0 ? (
            <RecordHistory halaqa={halaqa} onOpenDay={(d) => go({ date: d })} />
          ) : (
            <>
              {mine.length > 0 && (
                <DailyRecordHeader
                  sheet={sheet ?? null}
                  date={date}
                  today={today}
                  week={week.data ?? []}
                  halaqat={mine}
                  onDate={(d) => go({ date: d })}
                  onHalaqa={(h) => go({ halaqa: h })}
                />
              )}
              {halaqat.isPending || (!!halaqa && day.sheet.isPending) ? (
                <ul className="space-y-1.5" role="status" aria-label={t("common.loading")}>
                  {Array.from({ length: 6 }, (_, i) => (
                    <li
                      key={i}
                      className="h-14 rounded-2xl bg-muted/50 animate-pulse motion-reduce:animate-none"
                    />
                  ))}
                </ul>
              ) : halaqat.isError ? (
                <QueryError onRetry={() => void halaqat.refetch()} />
              ) : !mine.length ? (
                <EmptyState
                  icon={ClipboardList}
                  title={t("dailyRecord.noHalaqat")}
                  hint={t("dailyRecord.noHalaqatHint")}
                />
              ) : denied ? (
                <EmptyState icon={ShieldX} title={t("dailyRecord.denied")} />
              ) : sheetError === "AUTH_REQUIRED" ? (
                <EmptyState
                  icon={ShieldX}
                  title={t("dailyRecord.errors.AUTH_REQUIRED")}
                  action={
                    <Link
                      to="/auth/login"
                      className="mt-1 min-h-12 px-5 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold flex items-center"
                    >
                      {t("dailyRecord.signInAgain")}
                    </Link>
                  }
                />
              ) : day.sheet.isError || !sheet ? (
                <QueryError onRetry={() => void day.sheet.refetch()} />
              ) : (
                <>
                  {!sheet.record && !sheet.can_edit ? (
                    <EmptyState icon={ClipboardList} title={t("dailyRecord.open.readonly")} />
                  ) : (
                    <>
                      {status && status !== "open" && (
                        <div
                          className="glass rounded-2xl p-3 text-xs text-muted-foreground flex items-start gap-2"
                          role="note"
                        >
                          <Lock className="w-4 h-4 shrink-0 text-gold-ink" aria-hidden="true" />
                          <span className="flex-1">
                            {status === "locked"
                              ? t("dailyRecord.lockedNotice")
                              : t("dailyRecord.completedNotice")}
                          </span>
                        </div>
                      )}
                      {!sheet.record && (
                        <p className="text-xs text-muted-foreground text-center" role="note">
                          {t("dailyRecord.open.auto")}
                        </p>
                      )}
                      {!sheet.can_edit && status === "open" && (
                        <p className="text-xs text-muted-foreground text-center" role="note">
                          {t("dailyRecord.readonlyNotice")}
                        </p>
                      )}
                      {sheet.students.length === 0 ? (
                        <EmptyState icon={Users} title={t("dailyRecord.empty")} />
                      ) : (
                        <>
                          <RosterTools
                            query={query}
                            onQuery={setQuery}
                            filter={filter}
                            onFilter={setFilter}
                            counts={counts}
                          />
                          {visible.length === 0 ? (
                            <p
                              className="py-6 text-center text-xs text-muted-foreground"
                              role="status"
                            >
                              {t("dailyRecord.filter.none")}
                            </p>
                          ) : (
                            <RosterList
                              sort={sort}
                              onSort={setSort}
                              students={visible}
                              writable={writable}
                              pending={day.pending}
                              onAttendance={onAttendance}
                              onOpen={onOpen}
                              onBulk={bulkAttendance}
                              onReason={setAttendance}
                            />
                          )}
                        </>
                      )}
                    </>
                  )}
                  <StudentDayDialog
                    student={opened}
                    writable={writable && !!opened && isMember(opened)}
                    onClose={() => setOpenId(null)}
                    onSave={day.saveEntry}
                    nav={
                      openIndex >= 0
                        ? {
                            index: openIndex,
                            total: visible.length,
                            onPrev: prevId ? () => setOpenId(prevId) : null,
                            onNext: nextId ? () => setOpenId(nextId) : null,
                          }
                        : null
                    }
                    onReason={(student, st, reason) => setAttendance(student, st, reason)}
                  />
                  <ConfirmDialog
                    open={locking}
                    title={t("dailyRecord.lock.confirm")}
                    body={t("dailyRecord.lock.hint")}
                    confirmLabel={t("dailyRecord.lock.cta")}
                    destructive
                    busy={day.busy === "lock"}
                    onCancel={() => setLocking(false)}
                    onConfirm={() =>
                      void day.lock().then((ok) => {
                        setLocking(false);
                        if (ok) toast.success(t("dailyRecord.lock.done"));
                      })
                    }
                  />
                  <ConfirmDialog
                    open={!!awayAsk}
                    title={t("dailyRecord.away.title", { name: awayName })}
                    body={t("dailyRecord.away.body")}
                    confirmLabel={t("dailyRecord.away.confirm")}
                    destructive
                    busy={awayBusy}
                    onCancel={() => setAwayAsk(null)}
                    onConfirm={() => void confirmAway()}
                  />
                  <FinishRecordDialog
                    open={finishing}
                    students={sheet.students}
                    busy={day.busy === "complete"}
                    onClose={() => setFinishing(false)}
                    onConfirm={() => void finish()}
                    onMarkRestAbsent={() => void bulk("absent", "dailyRecord.bulk.restAbsentDone")}
                    onOpenStudent={(id) => {
                      setFinishing(false);
                      setOpenId(id);
                    }}
                  />
                </>
              )}
            </>
          )}
        </div>
        {!search.view && sheet && (sheet.record || sheet.can_edit) && !denied && (
          <RecordBar
            status={status}
            hasRecord={!!sheet.record}
            canEdit={sheet.can_edit}
            canLock={sheet.can_lock}
            writable={writable}
            busy={day.busy}
            unmarked={unmarked}
            note={sheet.record?.notes ?? null}
            canShare={!!sheet.record && sheet.students.length > 0}
            onAllPresent={() => void bulk("present", "dailyRecord.bulk.allPresentDone")}
            onFinish={() => setFinishing(true)}
            onReopen={() => void day.reopen()}
            onLock={() => setLocking(true)}
            onShare={() => void shareDay()}
            onSaveNote={day.saveNotes}
            halaqa={halaqa}
            onCodeClosed={() => void qc.invalidateQueries({ queryKey: ["daily-record", halaqa] })}
          />
        )}
      </div>
    </PhoneFrame>
  );
}
