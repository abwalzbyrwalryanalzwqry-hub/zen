/**
 * السجل اليومي — نداءات الخادم وصندوق الإرسال بلا اتصال. كل كتابة عبر دوال قاعدة البيانات
 * (supabase/migrations/20261117100000_halaqa_daily_records.sql) التي تتحقق من الهوية والصلاحية
 * ورقم النسخة؛ الواجهة لا تكتب في الجداول مباشرة.
 */
import { rpc } from "@/integrations/supabase/rpc";
import type { Json } from "@/integrations/supabase/types";
import { rememberReason } from "@/lib/last-reason";
import type {
  AttendanceStatus,
  DaySheet,
  DayStudent,
  ErrorType,
  Evaluation,
  RangeDirection,
  RecordStatus,
  Segment,
} from "@/lib/daily-record";

export interface WorkPayload {
  segments: Segment[];
  grade: number;
  error_type: ErrorType;
  notes: string | null;
  /** اتجاه الطالب (يُحفظ له في حلقته، 1.14.0). */
  direction?: RangeDirection;
}
/** المفتاح الغائب لا يُمسّ على الخادم؛ null يحذف. */
export interface EntryPayload {
  memorize?: WorkPayload | null;
  review?: WorkPayload | null;
  evaluation?: Evaluation | null;
  note?: string | null;
}
export interface RecordHead {
  id: string;
  status: RecordStatus;
  version: number;
  notes?: string | null;
}

async function call<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

export const fetchDailySheet = (halaqa: string, date: string) =>
  call<DaySheet>(rpc("daily_record_sheet", { _halaqa: halaqa, _date: date }));

export const openDailyRecord = (halaqa: string, date: string) =>
  call<RecordHead>(rpc("open_daily_record", { _halaqa: halaqa, _date: date }));

export const setDailyAttendance = (
  record: string,
  student: string,
  status: AttendanceStatus,
  reason: string | null,
  version: number,
) => {
  // 1.19.0: آخر سبب للطالب يُقترح في المرة القادمة (src/lib/last-reason.ts).
  if (reason && (status === "absent" || status === "excused")) rememberReason(student, reason);
  return call<DayStudent>(
    rpc("set_daily_attendance", {
      _record: record,
      _student: student,
      _status: status,
      _reason: reason,
      _version: version,
    }),
  );
};

/** مسح حالة حضور سُجّلت خطأً (DR-16). */
export const clearDailyAttendance = (record: string, student: string, version: number) =>
  call<DayStudent>(
    rpc("clear_daily_attendance", { _record: record, _student: student, _version: version }),
  );

export interface BulkRow {
  student: string;
  /** null = مسح الحضور (للتراجع). */
  status: AttendanceStatus | null;
  version: number;
}
export interface BulkResult {
  students: DayStudent[];
  skipped: Array<{ student: string; code: string }>;
}
/** «الجميع حاضر» و«الباقون غائبون» والتراجع عنهما في نداء واحد (DR-05). */
export const setDailyAttendanceBulk = (record: string, rows: BulkRow[]) =>
  call<BulkResult>(
    rpc("set_daily_attendance_bulk", { _record: record, _rows: rows as unknown as Json }),
  );

export interface WeekDay {
  date: string;
  status: RecordStatus | null;
}
/** حالة سجل كل يوم من الأيام السبعة المنتهية بـto (DR-07). */
export const fetchDailyWeek = async (halaqa: string, to: string) =>
  (await call<WeekDay[] | null>(rpc("daily_record_week", { _halaqa: halaqa, _to: to }))) ?? [];

export const saveDailyEntry = (
  record: string,
  student: string,
  payload: EntryPayload,
  version: number,
) =>
  call<DayStudent>(
    rpc("save_daily_entry", {
      _record: record,
      _student: student,
      _payload: payload as unknown as Json,
      _version: version,
    }),
  );

export const setDailyNotes = (record: string, notes: string | null, version: number) =>
  call<RecordHead>(
    rpc("set_daily_record_notes", { _record: record, _notes: notes, _version: version }),
  );

export const completeDailyRecord = (record: string, version: number) =>
  call<RecordHead>(rpc("complete_daily_record", { _record: record, _version: version }));

export const reopenDailyRecord = (record: string, version: number) =>
  call<RecordHead>(rpc("reopen_daily_record", { _record: record, _version: version }));

export const lockDailyRecord = (record: string, version: number) =>
  call<RecordHead>(rpc("lock_daily_record", { _record: record, _version: version }));

/** يوم في قائمة السجلات (DR-30): الأحدث أولاً بملخصه، وeditable لمدير الحلقة داخل النافذة. */
export interface HistoryDay {
  id: string;
  date: string;
  status: RecordStatus;
  version: number;
  notes: string | null;
  completed_at: string | null;
  updated_at: string;
  present: number;
  late: number;
  absent: number;
  excused: number;
  memorized: number;
  reviewed: number;
  editable: boolean;
}
export const fetchDailyHistory = async (halaqa: string, before: string | null = null, limit = 30) =>
  (await call<HistoryDay[] | null>(
    rpc("daily_record_history", {
      _halaqa: halaqa,
      ...(before ? { _before: before } : {}),
      _limit: limit,
    }),
  )) ?? [];

/**
 * حذف سجل يوم كاملاً (DR-31): الحضور والتسميعات وأسطر الطلاب، وتعود بطاقات المراجعة كما كانت.
 * منذ 1.14.0 تُحفظ لقطة اليوم في سلّة المحذوفات 30 يوماً (trash_id) ويُستعاد بـrestoreDailyRecord.
 */
export const deleteDailyRecord = (record: string, version: number) =>
  call<{ id: string; date: string; deleted: boolean; trash_id?: string }>(
    rpc("delete_daily_record", { _record: record, _version: version }),
  );

/** يوم في سلّة المحذوفات (آخر 30 يوماً). restorable = false إن أُنشئ لليوم نفسه سجل جديد بعده. */
export interface TrashDay {
  id: string;
  date: string;
  deleted_at: string;
  expires_at: string;
  attendance: number;
  sessions: number;
  restorable: boolean;
}
export const fetchDailyTrash = async (halaqa: string) =>
  (await call<TrashDay[] | null>(rpc("daily_record_trash_list", { _halaqa: halaqa }))) ?? [];

export const restoreDailyRecord = (trash: string) =>
  call<RecordHead & { date: string }>(rpc("restore_daily_record", { _trash: trash }));

export interface StudentDailyOverview {
  attendance: { present: number; late: number; absent: number; excused: number };
  last_memorize: (Segment & { session_date: string }) | null;
  last_review: (Segment & { session_date: string }) | null;
  last_evaluation: (Evaluation & { session_date: string }) | null;
  notes: Array<{ session_date: string; note: string }>;
}
export const fetchStudentDailyOverview = (student: string) =>
  call<StudentDailyOverview>(rpc("student_daily_overview", { _student: student }));

/* ─────────── صندوق الإرسال بلا اتصال ─────────── */

/**
 * عنصر لكل (سجل، طالب): آخر حضور وآخر حفظ مدموجان، ورقم النسخة التي بُني عليها التعديل.
 * عند الإرسال يُرفض العنصر برسالة تعارض إن عدّل غيرك السطر في الأثناء، ولا يُكتب فوقه بصمت.
 */
export interface DailyOutboxItem {
  record: string;
  student: string;
  halaqa: string;
  date: string;
  version: number;
  /** status = null: مسح الحضور. */
  attendance?: { status: AttendanceStatus | null; reason: string | null };
  entry?: EntryPayload;
  queued_at: string;
}
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const KEY = "zen.daily.outbox";

function store(): Store | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readDailyOutbox(s: Store | null = store()): DailyOutboxItem[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s.getItem(KEY) ?? "[]") as DailyOutboxItem[];
    return Array.isArray(v) ? v.filter((x) => x && x.record && x.student) : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: DailyOutboxItem[], s: Store | null) {
  if (!s) return;
  if (items.length) s.setItem(KEY, JSON.stringify(items));
  else s.removeItem(KEY);
}

/** يدمج التعديل مع المعلّق للطالب نفسه (النسخة الأساس تبقى نسخة أول تعديل). */
export function queueDaily(
  item: Omit<DailyOutboxItem, "queued_at">,
  s: Store | null = store(),
  now = new Date(),
) {
  const all = readDailyOutbox(s);
  const i = all.findIndex((x) => x.record === item.record && x.student === item.student);
  const prev = i >= 0 ? all[i] : null;
  const merged: DailyOutboxItem = {
    ...item,
    version: prev ? prev.version : item.version,
    attendance: item.attendance ?? prev?.attendance,
    entry: prev?.entry || item.entry ? { ...prev?.entry, ...item.entry } : undefined,
    queued_at: now.toISOString(),
  };
  if (i >= 0) all[i] = merged;
  else all.push(merged);
  writeOutbox(all, s);
}

export interface FlushResult {
  sent: number;
  rejected: Array<{ item: DailyOutboxItem; error: unknown }>;
}

interface FlushApi {
  setDailyAttendance: typeof setDailyAttendance;
  saveDailyEntry: typeof saveDailyEntry;
  clearDailyAttendance?: typeof clearDailyAttendance;
  openDailyRecord?: typeof openDailyRecord;
}

/**
 * يرسل المعلّق بالترتيب؛ خطأ الشبكة يُبقي العنصر، ورفض الخادم يُعاد مع سببه. السجل المحلي (يوم فُتح دون
 * اتصال، daily-offline.ts) يُفتح على الخادم مرة لكل يوم، ويُحفظ ما فُتح في `resolved` لصندوق السجل.
 */
export async function flushDailyOutbox(
  isNetwork: (e: unknown) => boolean,
  api: FlushApi = { setDailyAttendance, saveDailyEntry, clearDailyAttendance, openDailyRecord },
  s: Store | null = store(),
  resolved: Map<string, RecordHead> = new Map(),
): Promise<FlushResult> {
  const keep: DailyOutboxItem[] = [];
  const rejected: FlushResult["rejected"] = [];
  let sent = 0;
  const snapshot = readDailyOutbox(s);
  for (const original of snapshot) {
    let item = original;
    let version = item.version;
    let pending: DailyOutboxItem = item;
    try {
      if (item.record.startsWith("local:")) {
        let head = resolved.get(item.record);
        if (!head) {
          head = await (api.openDailyRecord ?? openDailyRecord)(item.halaqa, item.date);
          resolved.set(item.record, head);
        }
        item = { ...item, record: head.id };
        pending = item;
      }
      if (item.attendance) {
        const { status, reason } = item.attendance;
        const row = status
          ? await api.setDailyAttendance(item.record, item.student, status, reason, version)
          : await (api.clearDailyAttendance ?? clearDailyAttendance)(
              item.record,
              item.student,
              version,
            );
        version = row.version;
        pending = { ...item, attendance: undefined, version };
      }
      if (item.entry) await api.saveDailyEntry(item.record, item.student, item.entry, version);
      sent++;
    } catch (e) {
      if (isNetwork(e)) keep.push(pending);
      else rejected.push({ item: pending, error: e });
    }
  }
  // ما أُضيف أثناء الإرسال (لمسة جديدة) يبقى، ويحلّ محلّ المحفوظ للطالب نفسه لأنه مدموج معه.
  const same = (a: DailyOutboxItem, b: DailyOutboxItem) =>
    a.record === b.record && a.student === b.student && a.queued_at === b.queued_at;
  const fresh = readDailyOutbox(s).filter((x) => !snapshot.some((o) => same(o, x)));
  const key = (x: DailyOutboxItem) => `${x.halaqa}|${x.date}|${x.student}`;
  const freshKeys = new Set(fresh.map(key));
  writeOutbox([...keep.filter((x) => !freshKeys.has(key(x))), ...fresh], s);
  return { sent, rejected };
}
