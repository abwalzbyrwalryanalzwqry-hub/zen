/**
 * التقارير دون اتصال (1.16.0). `halaqa_report_data` قراءة لنطاق أيام، فتُحفظ آخر الاستجابات على الجهاز،
 * وحين لا يبلغ الخادم يُبنى التقرير من أصغر نسخة محفوظة **تغطي** المطلوب (نطاق أوسع، كل الطلاب أو
 * أكثرهم، كل الأيام أو أكثرها، ومعها سجل الإنجاز إن طُلب) بعد تصفيتها هنا كما يصفّي الخادم.
 *
 * وفوقها أوراق السجل اليومي على الجهاز (daily-record-cache) لأيام النطاق، مع ما في صندوق الإرسال:
 * ما سجّله المعلّم دون اتصال يظهر في تقريره قبل أن يصل إلى الخادم. وإن لم تُغطِّ أي نسخة المطلوب
 * يُبنى تقرير جزئي من أوراق الجهاز وحدها مع تنبيه.
 */
import type { DaySheet } from "@/lib/daily-record";
import type { ReportQuery } from "./api";
import type { HistorySegment, ReportData, ReportRow } from "./types";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const REPORT_CACHE_KEY = "zen.reports.cache";
const MAX_ENTRIES = 12;
const MAX_CHARS = 1_500_000;

interface Entry {
  q: Required<Pick<ReportQuery, "halaqa" | "from" | "to">> & {
    students: string[] | null;
    weekdays: number[] | null;
    history: boolean;
  };
  saved_at: string;
  data: ReportData;
}

function store(): Store | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}
function read(s: Store | null): Entry[] {
  try {
    const v = JSON.parse(s?.getItem(REPORT_CACHE_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((e) => e?.q?.halaqa && e?.data) : [];
  } catch {
    return [];
  }
}

const norm = (q: ReportQuery): Entry["q"] => ({
  halaqa: q.halaqa,
  from: q.from,
  to: q.to,
  students: q.students?.length ? [...q.students].sort() : null,
  weekdays: q.weekdays?.length && q.weekdays.length < 7 ? [...q.weekdays].sort() : null,
  history: !!q.history,
});

/** يحفظ استجابة حيّة (الأحدث أولاً، والحجم محدود). */
export function saveReport(q: ReportQuery, data: ReportData, s = store(), now = new Date()) {
  if (!s) return;
  const key = JSON.stringify(norm(q));
  let next: Entry[] = [
    { q: norm(q), saved_at: now.toISOString(), data },
    ...read(s).filter((e) => JSON.stringify(e.q) !== key),
  ].slice(0, MAX_ENTRIES);
  // الأقدم يُحذف حتى يصغر الحجم عن الحدّ؛ تقرير واحد أكبر منه لا يُحفظ.
  let text = JSON.stringify(next);
  while (text.length > MAX_CHARS && next.length > 1) {
    next = next.slice(0, -1);
    text = JSON.stringify(next);
  }
  if (text.length > MAX_CHARS) return;
  try {
    s.setItem(REPORT_CACHE_KEY, text);
  } catch {
    /* المساحة ممتلئة: التقرير الحيّ يكفي */
  }
}

const covers = (e: Entry["q"], q: Entry["q"]) =>
  e.halaqa === q.halaqa &&
  e.from <= q.from &&
  e.to >= q.to &&
  (e.history || !q.history) &&
  (e.students === null ||
    (q.students !== null && q.students.every((x) => e.students!.includes(x)))) &&
  (e.weekdays === null ||
    (q.weekdays !== null && q.weekdays.every((x) => e.weekdays!.includes(x))));

const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** يصفّي استجابة أوسع إلى المطلوب كما يصفّي الخادم. */
export function narrow(data: ReportData, q: Entry["q"]): ReportData {
  const inRange = (d: string) =>
    d >= q.from && d <= q.to && (q.weekdays === null || q.weekdays.includes(dow(d)));
  const who = (id: string) => q.students === null || q.students.includes(id);
  return {
    ...data,
    from: q.from,
    to: q.to,
    students: data.students.filter((s) => who(s.id)),
    days: data.days.filter((d) => inRange(d.date)),
    rows: data.rows.filter((r) => inRange(r.date) && who(r.student_id)),
    history: q.history ? data.history.filter((h) => h.date <= q.to && who(h.student_id)) : [],
  };
}

/** أصغر نسخة محفوظة تغطي المطلوب، مصفّاة إليه، مع وقت حفظها. */
export function coveringReport(
  q: ReportQuery,
  s = store(),
): { data: ReportData; saved_at: string } | null {
  const want = norm(q);
  const span = (e: Entry) => Date.parse(e.q.to) - Date.parse(e.q.from);
  const hit = read(s)
    .filter((e) => covers(e.q, want))
    .sort((a, b) => span(a) - span(b) || (a.saved_at < b.saved_at ? 1 : -1))[0];
  return hit ? { data: narrow(hit.data, want), saved_at: hit.saved_at } : null;
}

/* ─────────── أوراق السجل اليومي على الجهاز ─────────── */

const hasWork = (s: DaySheet["students"][number]) =>
  !!(s.status || s.memorize || s.review || s.evaluation || s.note);

function rowsOf(sheet: DaySheet): ReportRow[] {
  return sheet.students.filter(hasWork).map((s) => ({
    date: sheet.date,
    student_id: s.student_id,
    status: s.status,
    reason: s.reason,
    note: s.note,
    evaluation: s.evaluation,
    memorize: s.memorize,
    review: s.review,
  }));
}
function historyOf(sheet: DaySheet): HistorySegment[] {
  return sheet.students.flatMap((s) =>
    (s.memorize?.segments ?? []).map((g) => ({ ...g, student_id: s.student_id, date: sheet.date })),
  );
}

/**
 * يدمج أوراق الجهاز في التقرير: كل يوم له ورقة أحدث من النسخة (أو فيها ما لم يُرسل) يحلّ محلّ أيامها.
 * `sheets` مطبَّق عليها صندوق الإرسال، و`newerThan` وقت النسخة (أوراق أقدم منها لا تُستعمل).
 */
export function mergeSheets(
  data: ReportData,
  q: ReportQuery,
  sheets: Array<{ sheet: DaySheet; saved_at: string; pending: boolean }>,
  newerThan: string | null,
): ReportData {
  const want = norm(q);
  const use = sheets.filter(
    ({ sheet, saved_at, pending }) =>
      sheet.halaqa.id === want.halaqa &&
      sheet.date >= want.from &&
      sheet.date <= want.to &&
      (want.weekdays === null || want.weekdays.includes(dow(sheet.date))) &&
      (pending || newerThan === null || saved_at > newerThan),
  );
  if (!use.length) return data;
  const dates = new Set(use.map((u) => u.sheet.date));
  const who = (id: string) => want.students === null || want.students.includes(id);
  const known = new Set(data.students.map((s) => s.id));
  const extra = use
    .flatMap((u) => u.sheet.students)
    .filter((s) => who(s.student_id) && !known.has(s.student_id) && known.add(s.student_id))
    .map((s) => ({ id: s.student_id, name: s.name, member: s.member !== false }));
  const days = [
    ...data.days.filter((d) => !dates.has(d.date)),
    ...use
      .filter((u) => u.sheet.record)
      .map((u) => ({
        date: u.sheet.date,
        status: u.sheet.record!.status,
        notes: u.sheet.record!.notes,
      })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const rows = [
    ...data.rows.filter((r) => !dates.has(r.date)),
    ...use.flatMap((u) => rowsOf(u.sheet)).filter((r) => who(r.student_id)),
  ].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.student_id < b.student_id ? -1 : 1,
  );
  const history = want.history
    ? [
        ...data.history.filter((h) => !dates.has(h.date)),
        ...use.flatMap((u) => historyOf(u.sheet)).filter((h) => who(h.student_id)),
      ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    : data.history;
  return { ...data, students: [...data.students, ...extra], days, rows, history };
}

/** تقرير جزئي من أوراق الجهاز وحدها (لا نسخة تغطي المطلوب). */
export function reportFromSheets(
  q: ReportQuery,
  sheets: Array<{ sheet: DaySheet; saved_at: string; pending: boolean }>,
  now = new Date(),
): ReportData | null {
  const mine = sheets.filter((u) => u.sheet.halaqa.id === q.halaqa);
  const latest = [...mine].sort((a, b) => (a.sheet.date < b.sheet.date ? 1 : -1))[0];
  if (!latest) return null;
  const empty: ReportData = {
    halaqa: { ...latest.sheet.halaqa, center_name: null },
    from: q.from,
    to: q.to,
    today: latest.sheet.today,
    generated_at: now.toISOString(),
    schedule: [],
    students: [],
    days: [],
    rows: [],
    history: [],
  };
  const merged = mergeSheets(empty, q, mine, null);
  return merged.rows.length || merged.days.length ? merged : null;
}
