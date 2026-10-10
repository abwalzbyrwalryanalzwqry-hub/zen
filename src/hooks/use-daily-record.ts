/**
 * السجل اليومي في React Query (القاعدة: حالة الخادم عبر React Query كبقية التطبيق).
 * الحضور تحديث متفائل فوري، وعمليات الطالب الواحد متسلسلة حتى لا تتعارض نسخها مع نفسها؛
 * بلا اتصال تُحفظ في صندوق الإرسال وتُرسل عند عودته. السجل يُفتح ضمناً عند أول لمسة (DR-06).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { t } from "@/lib/i18n";
import { isOnline } from "@/lib/network";
import { cacheSheet, cachedSheet, latestSheet } from "@/lib/daily-record-cache";
import {
  applyEntry,
  blankDayFrom,
  flushRecordOutbox,
  isLocalRecord,
  localHead,
  overlayOutbox,
  overlayRecord,
  queueRecord,
  readRecordOutbox,
} from "@/lib/daily-offline";
import {
  dailyErrorCode,
  type AttendanceStatus,
  type DaySheet,
  type DayStudent,
} from "@/lib/daily-record";
import {
  completeDailyRecord,
  fetchDailySheet,
  flushDailyOutbox,
  lockDailyRecord,
  openDailyRecord,
  queueDaily,
  clearDailyAttendance,
  setDailyAttendanceBulk,
  type BulkRow,
  readDailyOutbox,
  reopenDailyRecord,
  saveDailyEntry,
  setDailyAttendance,
  setDailyNotes,
  type EntryPayload,
  type RecordHead,
} from "@/lib/daily-record-api";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

export const dailyKey = (halaqa: string, date: string) => ["daily-record", halaqa, date] as const;
export const isNetworkFailure = (e: unknown) => dailyErrorCode(e, isOnline()) === "NETWORK";
export const dailyErrorText = (e: unknown) =>
  t(`dailyRecord.errors.${dailyErrorCode(e, isOnline())}`);

export type SaveOutcome = "saved" | "queued";

/** خطأ شبكة مصطنع: السجل محلي (فُتح دون اتصال) فلا معنى لإرسال الكتابة قبل فتحه على الخادم. */
const OFFLINE = () => new TypeError("Failed to fetch (offline)");
/** ما في الصندوقين مطبَّقاً على الورقة (1.16.0). */
const withPending = (sheet: DaySheet) =>
  overlayRecord(overlayOutbox(sheet, readDailyOutbox()), readRecordOutbox());
const pendingCount = () => readDailyOutbox().length + readRecordOutbox().length;

/**
 * يرسل الصندوقين بالترتيب: أسطر الطلاب ثم السجل (الملاحظات والإنهاء) بالسجلات التي فُتحت أثناءها. إرسال
 * واحد في كل وقت مهما تعدّدت الشاشات (null لمن جاء أثناءه).
 */
let sending: Promise<unknown> | null = null;
export async function sendPending() {
  if (sending) return null;
  const run = (async () => {
    const resolved = new Map<string, RecordHead>();
    const a = await flushDailyOutbox(isNetworkFailure, undefined, undefined, resolved);
    const b = await flushRecordOutbox(
      isNetworkFailure,
      { open: openDailyRecord, notes: setDailyNotes, complete: completeDailyRecord },
      resolved,
    );
    return { sent: a.sent + b.sent, rejected: [...a.rejected, ...b.rejected] };
  })();
  sending = run;
  try {
    return await run;
  } finally {
    sending = null;
  }
}

/**
 * تحميل ورقة اليوم: من الخادم مع حفظ نسخة الجهاز، وبلا اتصال آخر نسخة لليوم أو يوم جديد من أحدث نسخة
 * للحلقة (DR-10، 1.16.0)، وفوقها ما في صندوق الإرسال. مُصدَّر للتحميل المسبق (1.17.0).
 */
export async function loadDailySheet(halaqa: string, date: string): Promise<DaySheet> {
  try {
    const fresh = await fetchDailySheet(halaqa, date);
    cacheSheet(halaqa, date, fresh);
    return withPending(fresh);
  } catch (e) {
    if (!isNetworkFailure(e)) throw e;
    const saved = cachedSheet(halaqa, date);
    const base = saved ?? latestSheet(halaqa);
    const local = saved ?? (base && base.date <= date ? blankDayFrom(base, date) : null);
    if (local) return withPending(local);
    throw e;
  }
}

export function useDailyRecord(halaqa: string, date: string) {
  const qc = useQueryClient();
  const key = dailyKey(halaqa, date);
  const sheet = useQuery({
    queryKey: key,
    enabled: !!halaqa && !!date,
    // نسخة الجهاز (DR-10): بلا اتصال تُعرض آخر نسخة لليوم، أو يوم جديد من أحدث نسخة للحلقة (1.16.0)،
    // وفوقها ما في صندوق الإرسال؛ والتعديل يذهب إلى الصندوق.
    queryFn: () => loadDailySheet(halaqa, date),
  });
  const [queued, setQueued] = useState(pendingCount);
  const [busy, setBusy] = useState<string | null>(null);
  // سلسلة وعود لكل طالب: كل عملية تنتظر سابقتها وتأخذ أحدث نسخة من الذاكرة.
  const chains = useRef(new Map<string, Promise<unknown>>());

  const current = useCallback(
    () => qc.getQueryData<DaySheet>(dailyKey(halaqa, date)),
    [qc, halaqa, date],
  );
  const patchStudent = useCallback(
    (id: string, fn: (s: DayStudent) => DayStudent) =>
      qc.setQueryData<DaySheet>(dailyKey(halaqa, date), (old) =>
        old
          ? { ...old, students: old.students.map((s) => (s.student_id === id ? fn(s) : s)) }
          : old,
      ),
    [qc, halaqa, date],
  );
  const patchRecord = useCallback(
    (head: RecordHead) =>
      qc.setQueryData<DaySheet>(dailyKey(halaqa, date), (old) => {
        if (!old) return old;
        const base = {
          completed_at: null,
          locked_at: null,
          completed_by_name: null,
          notes: null,
          ...old.record,
        };
        return {
          ...old,
          record: { ...base, ...head, notes: head.notes !== undefined ? head.notes : base.notes },
        };
      }),
    [qc, halaqa, date],
  );

  const serial = useCallback(<T>(student: string, job: () => Promise<T>): Promise<T> => {
    const prev = chains.current.get(student) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(job);
    chains.current.set(student, next);
    return next;
  }, []);

  const refetch = useCallback(
    () => void qc.invalidateQueries({ queryKey: dailyKey(halaqa, date) }),
    [qc, halaqa, date],
  );
  const refreshQueued = useCallback(() => setQueued(pendingCount()), []);
  /** طلاب هذا اليوم الذين في الصندوق ولم يُرسلوا بعد (مؤشّر «لم يُرسل» على الصف، 1.14.0). */
  const pending = useMemo(
    () =>
      new Set(
        queued
          ? readDailyOutbox()
              .filter((x) => x.halaqa === halaqa && x.date === date)
              .map((x) => x.student)
          : [],
      ),
    [queued, halaqa, date],
  );

  // فتح السجل ضمناً عند أول عملية (DR-06): وعد واحد مشترك حتى لا تفتح لمستان متزامنتان مرتين.
  const opening = useRef<Promise<string> | null>(null);
  // دون اتصال يُفتح سجل محلي (daily-offline.ts) يُفتح على الخادم عند الإرسال، والسجل المحلي يُحلّ
  // بأول عملية بعد عودة الاتصال.
  const ensureRecord = useCallback(async (): Promise<string> => {
    const id = current()?.record?.id;
    if (id && !isLocalRecord(id)) return id;
    if (id && !isOnline()) return id;
    if (!opening.current) {
      opening.current = openDailyRecord(halaqa, date)
        .then((head) => {
          patchRecord(head);
          return head.id;
        })
        .catch((e) => {
          if (!isNetworkFailure(e)) throw e;
          if (id) return id;
          const head = localHead(halaqa, date);
          patchRecord(head);
          return head.id;
        })
        .finally(() => {
          opening.current = null;
        });
    }
    return opening.current;
  }, [current, halaqa, date, patchRecord]);

  /** لمسة الحضور (status = null يمسحه): تظهر فوراً، وتُرسل في الخلفية، وتُعاد عند الرفض. */
  const setAttendance = useCallback(
    (student: string, status: AttendanceStatus | null, reason: string | null = null) => {
      const before = current()?.students.find((s) => s.student_id === student);
      if (!before) return Promise.resolve(false);
      // السبب null مع الحالة نفسها يُبقيه الخادم (DR-02)؛ نُظهر ذلك فوراً بدل مسحه ثم إعادته.
      const shown =
        status === "present" || !status
          ? null
          : (reason ?? (status === before.status ? before.reason : null));
      patchStudent(student, (s) => ({ ...s, status, reason: shown }));
      return serial(student, async () => {
        let record: string | undefined;
        try {
          record = await ensureRecord();
          const version = current()?.students.find((s) => s.student_id === student)?.version ?? 0;
          try {
            if (isLocalRecord(record)) throw OFFLINE();
            const row = status
              ? await setDailyAttendance(record, student, status, reason, version)
              : await clearDailyAttendance(record, student, version);
            patchStudent(student, () => row);
            return true;
          } catch (e) {
            if (!isNetworkFailure(e)) throw e;
            queueDaily({ record, student, halaqa, date, version, attendance: { status, reason } });
            refreshQueued();
            return true;
          }
        } catch (e) {
          patchStudent(student, (s) => ({ ...s, status: before.status, reason: before.reason }));
          toast.error(dailyErrorText(e));
          if (dailyErrorCode(e) === "VERSION_CONFLICT") refetch();
          return false;
        }
      });
    },
    [current, patchStudent, serial, ensureRecord, halaqa, date, refreshQueued, refetch],
  );

  /**
   * حضور جماعي (DR-05): يطبَّق فوراً، ثم نداء واحد. يعيد أسطر التراجع (الحالة السابقة لكل من نجح)
   * أو null عند الفشل. المتخطّى (عدّله غيره) يُعاد إلى ما على الخادم.
   */
  const bulkAttendance = useCallback(
    async (
      changes: Array<{ student: string; status: AttendanceStatus | null }>,
    ): Promise<Array<{ student: string; status: AttendanceStatus | null }> | null> => {
      const sheetNow = current();
      if (!sheetNow || !changes.length) return null;
      const before = new Map(sheetNow.students.map((s) => [s.student_id, s]));
      for (const c of changes)
        patchStudent(c.student, (s) => ({ ...s, status: c.status, reason: null }));
      setBusy("bulk");
      let record: string | undefined;
      try {
        record = await ensureRecord();
        const rows: BulkRow[] = changes.map((c) => ({
          student: c.student,
          status: c.status,
          version: before.get(c.student)?.version ?? 0,
        }));
        let res;
        try {
          if (isLocalRecord(record)) throw OFFLINE();
          res = await setDailyAttendanceBulk(record, rows);
        } catch (e) {
          if (!isNetworkFailure(e)) throw e;
          // دون اتصال: كل طالب في الصندوق، والمعروض يبقى كما طُبّق.
          for (const r of rows)
            queueDaily({
              record,
              student: r.student,
              halaqa,
              date,
              version: r.version,
              attendance: { status: r.status, reason: null },
            });
          refreshQueued();
          return changes.map((c) => ({
            student: c.student,
            status: before.get(c.student)?.status ?? null,
          }));
        }
        for (const row of res.students) patchStudent(row.student_id, () => row);
        if (res.skipped.length) {
          toast.error(t("dailyRecord.bulk.skipped", { n: res.skipped.length }));
          refetch();
        }
        const ok = new Set(res.students.map((r) => r.student_id));
        return changes
          .filter((c) => ok.has(c.student))
          .map((c) => ({ student: c.student, status: before.get(c.student)?.status ?? null }));
      } catch (e) {
        for (const c of changes) {
          const b = before.get(c.student);
          if (b) patchStudent(c.student, () => b);
        }
        toast.error(dailyErrorText(e));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [current, patchStudent, ensureRecord, refetch, halaqa, date, refreshQueued],
  );

  /** حفظ ما في لوحة الطالب. يرمي الخطأ للّوحة لتبقى البيانات المُدخلة كما هي. */
  const saveEntry = useCallback(
    (student: string, payload: EntryPayload): Promise<SaveOutcome> => {
      return serial(student, async () => {
        const record = await ensureRecord();
        const version = current()?.students.find((s) => s.student_id === student)?.version ?? 0;
        try {
          if (isLocalRecord(record)) throw OFFLINE();
          const row = await saveDailyEntry(record, student, payload, version);
          patchStudent(student, () => row);
          return "saved" as const;
        } catch (e) {
          if (!isNetworkFailure(e)) throw e;
          queueDaily({ record, student, halaqa, date, version, entry: payload });
          // يظهر على السطر فوراً كما سيحفظه الخادم (كان يبقى السطر القديم حتى الإرسال).
          patchStudent(student, (s) => applyEntry(s, payload));
          refreshQueued();
          return "queued" as const;
        }
      });
    },
    [current, serial, ensureRecord, patchStudent, halaqa, date, refreshQueued],
  );

  /**
   * عملية على السجل. `offline` (الملاحظات والإنهاء): دون اتصال، أو والسجل محلي، تُحفظ في صندوق السجل
   * وتظهر فوراً، وتُرسل بعد أسطر الطلاب. إعادة الفتح والإغلاق النهائي تحتاجان الخادم.
   */
  const recordAction = useCallback(
    async (
      name: string,
      run: (id: string, v: number) => Promise<RecordHead>,
      offline?: { notes?: string | null; complete?: boolean },
    ) => {
      const rec = current()?.record;
      if (!rec) return false;
      setBusy(name);
      try {
        try {
          if (isLocalRecord(rec.id)) throw OFFLINE();
          patchRecord(await run(rec.id, rec.version));
        } catch (e) {
          if (!offline || !isNetworkFailure(e)) throw e;
          queueRecord({ record: rec.id, halaqa, date, version: rec.version, ...offline });
          refreshQueued();
          qc.setQueryData<DaySheet>(dailyKey(halaqa, date), (old) =>
            old ? overlayRecord(old, readRecordOutbox()) : old,
          );
          return true;
        }
        void qc.invalidateQueries({ queryKey: dailyKey(halaqa, date) });
        return true;
      } catch (e) {
        toast.error(dailyErrorText(e));
        if (dailyErrorCode(e) === "VERSION_CONFLICT") refetch();
        return false;
      } finally {
        setBusy(null);
      }
    },
    [current, patchRecord, qc, halaqa, date, refetch, refreshQueued],
  );

  const open = useCallback(async () => {
    setBusy("open");
    try {
      patchRecord(await openDailyRecord(halaqa, date));
      void qc.invalidateQueries({ queryKey: dailyKey(halaqa, date) });
    } catch (e) {
      toast.error(dailyErrorText(e));
    } finally {
      setBusy(null);
    }
  }, [halaqa, date, patchRecord, qc]);

  const saveNotes = useCallback(
    async (notes: string | null) => {
      if (!current()?.record) {
        try {
          await ensureRecord();
        } catch (e) {
          toast.error(dailyErrorText(e));
          return false;
        }
      }
      return recordAction("notes", (id, v) => setDailyNotes(id, notes, v), { notes });
    },
    [current, ensureRecord, recordAction],
  );
  const complete = useCallback(
    () => recordAction("complete", completeDailyRecord, { complete: true }),
    [recordAction],
  );
  const reopen = useCallback(() => recordAction("reopen", reopenDailyRecord), [recordAction]);
  const lock = useCallback(() => recordAction("lock", lockDailyRecord), [recordAction]);

  // إرسال المعلّق عند عودة الاتصال (وعند فتح الشاشة).
  useEffect(() => {
    const flush = () => {
      if (!pendingCount() || !isOnline()) return;
      void sendPending().then((r) => {
        setQueued(pendingCount());
        if (!r) return;
        if (r.sent) {
          toast.success(t("dailyRecord.outbox.sent", { n: r.sent }));
          void qc.invalidateQueries({ queryKey: ["daily-record"] });
        }
        if (r.rejected.length) toast.error(dailyErrorText(r.rejected[0].error));
      });
    };
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [qc]);

  return {
    sheet,
    queued,
    pending,
    busy,
    setAttendance,
    bulkAttendance,
    saveEntry,
    open,
    saveNotes,
    complete,
    reopen,
    lock,
  };
}
