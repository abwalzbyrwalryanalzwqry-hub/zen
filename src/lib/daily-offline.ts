/**
 * السجل اليومي دون اتصال كاملاً (1.16.0). كان صندوق الإرسال يحفظ لمسة الحضور ولوحة الطالب فقط، وبشرط
 * أن يكون سجل اليوم مفتوحاً على الخادم ونسخة يومه على الجهاز. الآن:
 *
 *  - يوم لم يُفتح بعد: سجل محلي `local:<الحلقة>:<اليوم>` يُفتح على الخادم أولاً عند الإرسال.
 *  - يوم بلا نسخة على الجهاز: ورقة تُبنى من أحدث نسخة للحلقة نفسها (الطلاب وآخر حفظ ومراجعة) فارغةً.
 *  - كل ما في الصندوق يُطبَّق على الورقة المعروضة (حتى بعد إعادة الفتح دون اتصال)، فلا يختفي ما أدخله
 *    المعلّم قبل أن يصل إلى الخادم.
 *  - ملاحظات اليوم وإنهاؤه في صندوق مستقل للسجل، يُرسل بعد أسطر الطلاب.
 */
import type { DaySheet, DayStudent, LastWork } from "@/lib/daily-record";
import type {
  DailyOutboxItem,
  EntryPayload,
  RecordHead,
  WorkPayload,
} from "@/lib/daily-record-api";

export const LOCAL_PREFIX = "local:";
export const localRecordId = (halaqa: string, date: string) => `${LOCAL_PREFIX}${halaqa}:${date}`;
export const isLocalRecord = (id: string | null | undefined) => !!id?.startsWith(LOCAL_PREFIX);

/** رأس سجل محلي لليوم (مفتوح، النسخة 0). */
export function localHead(halaqa: string, date: string): RecordHead {
  return { id: localRecordId(halaqa, date), status: "open", version: 0, notes: null };
}

const work = (w: WorkPayload | null | undefined) =>
  w
    ? { segments: w.segments, score: w.grade, error_type: w.error_type, notes: w.notes ?? null }
    : null;

/** يطبّق حمولة لوحة الطالب على سطره كما سيعيدها الخادم (المفتاح الغائب لا يُمسّ). */
export function applyEntry(s: DayStudent, p: EntryPayload): DayStudent {
  const next = { ...s };
  if ("memorize" in p) {
    next.memorize = work(p.memorize);
    if (p.memorize?.direction) next.memorize_dir = p.memorize.direction;
  }
  if ("review" in p) {
    next.review = work(p.review);
    if (p.review?.direction) next.review_dir = p.review.direction;
  }
  if ("evaluation" in p) next.evaluation = p.evaluation ?? null;
  if ("note" in p) next.note = p.note ?? null;
  return next;
}

/** يطبّق ما في الصندوق لهذه الحلقة واليوم على الورقة (المعروض = ما سيكون بعد الإرسال). */
export function overlayOutbox(sheet: DaySheet, items: DailyOutboxItem[]): DaySheet {
  const mine = items.filter((x) => x.halaqa === sheet.halaqa.id && x.date === sheet.date);
  if (!mine.length) return sheet;
  const by = new Map(mine.map((x) => [x.student, x]));
  const local = mine.find((x) => isLocalRecord(x.record));
  return {
    ...sheet,
    record:
      sheet.record ??
      (local
        ? {
            id: local.record,
            status: "open",
            version: 0,
            notes: null,
            completed_at: null,
            locked_at: null,
            completed_by_name: null,
          }
        : null),
    students: sheet.students.map((s) => {
      const it = by.get(s.student_id);
      if (!it) return s;
      let row = s;
      if (it.attendance) {
        const { status, reason } = it.attendance;
        row = { ...row, status, reason: status === "present" || !status ? null : reason };
      }
      return it.entry ? applyEntry(row, it.entry) : row;
    }),
  };
}

const lastOf = (
  w: DayStudent["memorize"],
  date: string,
  prev: LastWork | null,
): LastWork | null => {
  const seg = w?.segments.at(-1);
  return seg ? { ...seg, session_date: date } : prev;
};

/**
 * ورقة يوم جديد من أحدث نسخة للحلقة (دون اتصال): الطلاب الحاليون بلا حضور ولا تسميع، و«آخر حفظ/مراجعة»
 * محدَّثان بما سُجّل في يوم النسخة. `today` يبقى يوم الخادم في النسخة، و`cached_at` وقتها.
 */
export function blankDayFrom(base: DaySheet, date: string): DaySheet {
  return {
    halaqa: base.halaqa,
    date,
    today: base.today,
    can_edit: base.can_edit,
    can_lock: base.can_lock,
    record: null,
    cached_at: base.cached_at,
    local_day: true,
    students: base.students
      .filter((s) => s.member !== false)
      .map((s) => ({
        ...s,
        status: null,
        reason: null,
        version: 0,
        note: null,
        evaluation: null,
        memorize: null,
        review: null,
        last_memorize:
          base.date < date ? lastOf(s.memorize, base.date, s.last_memorize) : s.last_memorize,
        last_review: base.date < date ? lastOf(s.review, base.date, s.last_review) : s.last_review,
        absences_30d: s.absences_30d + (base.date < date && s.status === "absent" ? 1 : 0),
      })),
  };
}

/* ─────────── صندوق السجل: الملاحظات والإنهاء ─────────── */

export interface RecordOutboxItem {
  record: string;
  halaqa: string;
  date: string;
  version: number;
  /** الغائب لا يُمسّ؛ null يمسح. */
  notes?: string | null;
  complete?: boolean;
  queued_at: string;
}
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const RKEY = "zen.daily.recordbox";
function store(): Store | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readRecordOutbox(s: Store | null = store()): RecordOutboxItem[] {
  try {
    const v = JSON.parse(s?.getItem(RKEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && x.halaqa && x.date) : [];
  } catch {
    return [];
  }
}
function writeRecordOutbox(items: RecordOutboxItem[], s: Store | null) {
  if (!s) return;
  if (items.length) s.setItem(RKEY, JSON.stringify(items));
  else s.removeItem(RKEY);
}

/** يدمج مع المعلّق لليوم نفسه (النسخة الأساس نسخة أول تعديل). */
export function queueRecord(
  item: Omit<RecordOutboxItem, "queued_at">,
  s: Store | null = store(),
  now = new Date(),
) {
  const all = readRecordOutbox(s);
  const i = all.findIndex((x) => x.halaqa === item.halaqa && x.date === item.date);
  const prev = i >= 0 ? all[i] : null;
  const merged: RecordOutboxItem = {
    ...prev,
    ...item,
    version: prev ? prev.version : item.version,
    complete: item.complete ?? prev?.complete,
    queued_at: now.toISOString(),
  };
  if (!("notes" in item) && prev && "notes" in prev) merged.notes = prev.notes;
  if (i >= 0) all[i] = merged;
  else all.push(merged);
  writeRecordOutbox(all, s);
}

/** يطبّق المعلّق على رأس السجل المعروض. */
export function overlayRecord(sheet: DaySheet, items: RecordOutboxItem[]): DaySheet {
  const it = items.find((x) => x.halaqa === sheet.halaqa.id && x.date === sheet.date);
  if (!it || !sheet.record) return sheet;
  return {
    ...sheet,
    record: {
      ...sheet.record,
      ...("notes" in it ? { notes: it.notes ?? null } : {}),
      ...(it.complete
        ? { status: "completed" as const, completed_at: sheet.record.completed_at ?? it.queued_at }
        : {}),
    },
  };
}

export interface RecordFlushApi {
  open: (halaqa: string, date: string) => Promise<RecordHead>;
  notes: (record: string, notes: string | null, version: number) => Promise<RecordHead>;
  complete: (record: string, version: number) => Promise<RecordHead>;
}

/**
 * يرسل صندوق السجل بعد أسطر الطلاب: يحلّ السجل المحلي بفتحه، ثم الملاحظات ثم الإنهاء بآخر نسخة.
 * `resolved` يحمل ما فُتح أثناء إرسال أسطر الطلاب (سجل محلي ← معرّف الخادم).
 */
export async function flushRecordOutbox(
  isNetwork: (e: unknown) => boolean,
  api: RecordFlushApi,
  resolved: Map<string, RecordHead>,
  s: Store | null = store(),
): Promise<{ sent: number; rejected: Array<{ item: RecordOutboxItem; error: unknown }> }> {
  const keep: RecordOutboxItem[] = [];
  const rejected: Array<{ item: RecordOutboxItem; error: unknown }> = [];
  let sent = 0;
  for (const item of readRecordOutbox(s)) {
    let pending = item;
    try {
      let head = resolved.get(item.record);
      if (!head && isLocalRecord(item.record)) {
        head = await api.open(item.halaqa, item.date);
        resolved.set(item.record, head);
      }
      let id = head?.id ?? item.record;
      let version = head && isLocalRecord(item.record) ? head.version : item.version;
      pending = { ...item, record: id, version };
      if ("notes" in item) {
        const h = await api.notes(id, item.notes ?? null, version);
        ({ id, version } = h);
        pending = { ...pending, notes: undefined, version };
        delete pending.notes;
      }
      if (item.complete) await api.complete(id, version);
      sent++;
    } catch (e) {
      if (isNetwork(e)) keep.push(pending);
      else rejected.push({ item: pending, error: e });
    }
  }
  writeRecordOutbox(keep, s);
  return { sent, rejected };
}
