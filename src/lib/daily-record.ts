/**
 * السجل اليومي للحلقة — منطق المجال الصرف (بلا React ولا شبكة). docs/DAILY_RECORD.md
 *
 * السجل امتداد لـ«سجل الحلقة» (9.1): الحضور في attendance، والحفظ والمراجعة في recitation_sessions،
 * وسطر الطالب في halaqa_register_entries، والسجل نفسه في halaqa_daily_records. الملخص والتنبيهات
 * تُحسب هنا من البيانات ولا تُخزَّن.
 */
import { SURAHS } from "@/lib/quran-meta";
import { PAGE_STARTS } from "@/lib/quran/structure-data";
import type { AttendanceStatus, ErrorType } from "@/lib/halaqa-register";

export type { AttendanceStatus, ErrorType };
export type RecordStatus = "open" | "completed" | "locked";
export type DayKind = "memorize" | "review";
export const ATTENDANCE: readonly AttendanceStatus[] = ["present", "late", "absent", "excused"];
export const EVAL_CRITERIA = ["overall", "tajweed", "pronunciation", "behavior"] as const;
export type EvalCriterion = (typeof EVAL_CRITERIA)[number];
export type Evaluation = Partial<Record<EvalCriterion, number | null>>;

export interface Segment {
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
}
export interface DayWork {
  segments: Segment[];
  score: number | null;
  error_type: ErrorType | null;
  notes: string | null;
}
export interface LastWork extends Segment {
  session_date: string;
}
export interface DayStudent {
  student_id: string;
  name: string;
  avatar: string | null;
  status: AttendanceStatus | null;
  reason: string | null;
  version: number;
  note: string | null;
  evaluation: Evaluation | null;
  memorize: DayWork | null;
  review: DayWork | null;
  last_memorize: LastWork | null;
  last_review: LastWork | null;
  absences_30d: number;
  /** false: انتقل من الحلقة بعد هذا اليوم (يُعرض للقراءة فقط، DR-13). غائب في الاستجابات القديمة. */
  member?: boolean;
  /** اتجاه الطالب في الحفظ والمراجعة (1.14.0)؛ غائب في الاستجابات القديمة = forward. */
  memorize_dir?: RangeDirection;
  review_dir?: RangeDirection;
}
export interface DayRecord {
  id: string;
  status: RecordStatus;
  version: number;
  notes: string | null;
  completed_at: string | null;
  locked_at: string | null;
  completed_by_name: string | null;
}
export interface DaySheet {
  halaqa: { id: string; name: string; teacher_name: string | null };
  date: string;
  today: string;
  can_edit: boolean;
  can_lock: boolean;
  record: DayRecord | null;
  students: DayStudent[];
  /** عُرضت من نسخة الجهاز لانقطاع الاتصال (DR-10): وقت حفظها. */
  cached_at?: string;
  /** يوم جديد بُني على الجهاز دون اتصال من أحدث نسخة للحلقة (1.16.0، daily-offline.ts). */
  local_day?: boolean;
}

/** عضو حالي في الحلقة (من انتقل يُعرض ولا يُعدّ في النواقص ولا الحضور الجماعي). */
export const isMember = (s: Pick<DayStudent, "member">) => s.member !== false;

/* ─────────── مدى الآيات (المكوّن الموحَّد للحفظ والمراجعة) ─────────── */

/**
 * مدى بأرقام السور (1..114) قد يمتدّ عبر أكثر من سورة، في أحد اتجاهين:
 * - forward (بترتيب المصحف): من الفاتحة نحو الناس، fromSurah ≤ toSurah.
 * - backward (من الناس صعوداً): الناس ثم الفلق ثم الإخلاص...، fromSurah > toSurah.
 * المقطع داخل كل سورة من آية إلى ما بعدها دائماً؛ الاتجاه في ترتيب السور فقط.
 */
export interface QuranRange {
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
}
export type RangeDirection = "forward" | "backward";
export const RANGE_DIRECTIONS: readonly RangeDirection[] = ["forward", "backward"];
export type RangeError = "incomplete" | "ayahOutOfSurah" | "endBeforeStart" | "tooLong";

/** أقصى عدد سور في مدى واحد (كما على الخادم): يكفي مراجعة جزء عمّ كاملاً (37 سورة). */
export const MAX_SEGMENTS = 60;
const surahByNo = (n: number) => SURAHS[n - 1];
export const surahNo = (name: string) => SURAHS.find((s) => s.name === name)?.n ?? 0;

/** اتجاه مدى مكتمل: تنازلي في أرقام السور = backward. */
export const rangeDirection = (r: Partial<QuranRange>): RangeDirection =>
  r.fromSurah && r.toSurah && r.toSurah < r.fromSurah ? "backward" : "forward";

export function validateRange(r: Partial<QuranRange>): RangeError | null {
  const { fromSurah, fromAyah, toSurah, toAyah } = r;
  if (!fromSurah || !fromAyah || !toSurah || !toAyah) return "incomplete";
  const a = surahByNo(fromSurah);
  const b = surahByNo(toSurah);
  if (!a || !b) return "incomplete";
  if (fromAyah < 1 || fromAyah > a.ayahs || toAyah < 1 || toAyah > b.ayahs) return "ayahOutOfSurah";
  // داخل السورة الواحدة: النهاية بعد البداية. عبر السور: أي اتجاه.
  if (toSurah === fromSurah && toAyah < fromAyah) return "endBeforeStart";
  if (Math.abs(toSurah - fromSurah) + 1 > MAX_SEGMENTS) return "tooLong";
  return null;
}

/** أرقام سور المدى بترتيبه (تصاعدياً أو تنازلياً). */
function surahsOf(r: QuranRange): number[] {
  const step = r.toSurah >= r.fromSurah ? 1 : -1;
  const out: number[] = [];
  for (let n = r.fromSurah; n !== r.toSurah + step; n += step) out.push(n);
  return out;
}

/**
 * المدى إلى مقاطع سورة سورة بترتيبه (كما يخزّنها الخادم في recitation_sessions مع seg_index):
 * الأولى من آية البداية إلى آخرها، والوسطى كاملة، والأخيرة من أولها إلى آية النهاية.
 */
export function rangeToSegments(r: QuranRange): Segment[] {
  if (validateRange(r)) return [];
  return surahsOf(r).map((n) => {
    const s = surahByNo(n);
    return {
      surah_name: s.name,
      from_ayah: n === r.fromSurah ? r.fromAyah : 1,
      to_ayah: n === r.toSurah ? r.toAyah : s.ayahs,
    };
  });
}

/**
 * المقاطع المخزَّنة إلى مدى واحد للعرض والتعديل. المقاطع بترتيب سور تنازلي (من الناس صعوداً) تُقرأ
 * كما هي؛ وغير ذلك (والقديم بلا ترتيب) بترتيب المصحف.
 */
export function segmentsToRange(segs: readonly Segment[] | null | undefined): QuranRange | null {
  const known = (segs ?? []).filter((s) => surahNo(s.surah_name) > 0);
  if (!known.length) return null;
  const nos = known.map((s) => surahNo(s.surah_name));
  // تنازلي بشكل مدى «من الناس صعوداً»: الأولى إلى آخرها، والأخيرة من أولها، والوسطى كاملة.
  const full = (x: Segment) => x.to_ayah === surahByNo(surahNo(x.surah_name)).ayahs;
  const descending =
    nos.length > 1 &&
    nos.every((n, i) => i === 0 || n < nos[i - 1]) &&
    known.every((x, i) => (i === 0 || x.from_ayah === 1) && (i === known.length - 1 || full(x)));
  const sorted = descending
    ? known
    : [...known].sort(
        (x, y) => surahNo(x.surah_name) - surahNo(y.surah_name) || x.from_ayah - y.from_ayah,
      );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return {
    fromSurah: surahNo(first.surah_name),
    fromAyah: first.from_ayah,
    toSurah: surahNo(last.surah_name),
    toAyah: last.to_ayah,
  };
}

/** هل الآية (s, a) داخل المدى؟ (للتظليل في المصحف وشبكة الآيات، في الاتجاهين). */
export function inRangePos(r: QuranRange | null | undefined, s: number, a: number): boolean {
  if (!r || validateRange(r)) return false;
  const lo = Math.min(r.fromSurah, r.toSurah);
  const hi = Math.max(r.fromSurah, r.toSurah);
  if (s < lo || s > hi) return false;
  const seg = rangeToSegments(r).find((x) => surahNo(x.surah_name) === s);
  return !!seg && a >= seg.from_ayah && a <= seg.to_ayah;
}

/** رقم صفحة الآية في مصحف المدينة (604 صفحات). */
export function pageOf(surah: number, ayah: number): number {
  let lo = 0;
  let hi = PAGE_STARTS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const [s, a] = PAGE_STARTS[mid];
    if (s < surah || (s === surah && a <= ayah)) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** عدد الصفحات التي يمسّها المدى (للعرض فقط): الصفحات المختلفة لكل مقاطعه، في الاتجاهين. */
export function rangePages(r: QuranRange): number {
  if (validateRange(r)) return 0;
  if (rangeDirection(r) === "forward")
    return pageOf(r.toSurah, r.toAyah) - pageOf(r.fromSurah, r.fromAyah) + 1;
  const pages = new Set<number>();
  for (const seg of rangeToSegments(r)) {
    const n = surahNo(seg.surah_name);
    for (let p = pageOf(n, seg.from_ayah); p <= pageOf(n, seg.to_ayah); p++) pages.add(p);
  }
  return pages.size;
}

/**
 * بداية مقترحة بعد آخر حفظ: الآية التالية، أو أول السورة التالية في اتجاه الطالب إن انتهت السورة
 * (forward: السورة بعدها في المصحف، backward: السورة قبلها، كمن يحفظ من الناس صعوداً).
 */
export function suggestStart(
  last: Segment | null | undefined,
  dir: RangeDirection = "forward",
): Partial<QuranRange> {
  const n = last ? surahNo(last.surah_name) : 0;
  if (!last || !n) return dir === "backward" ? { fromSurah: 114, fromAyah: 1, toSurah: 114 } : {};
  const s = surahByNo(n);
  if (last.to_ayah < s.ayahs) return { fromSurah: n, fromAyah: last.to_ayah + 1, toSurah: n };
  const next = dir === "backward" ? n - 1 : n + 1;
  if (next >= 1 && next <= SURAHS.length) return { fromSurah: next, fromAyah: 1, toSurah: next };
  return {};
}

/** الاتجاه المحفوظ للطالب في هذا النوع (forward إن لم يُحفظ). */
export const directionOf = (s: Pick<DayStudent, "memorize_dir" | "review_dir">, kind: DayKind) =>
  (kind === "memorize" ? s.memorize_dir : s.review_dir) ?? "forward";

/** آخر آية سُجّلت للطالب في هذا النوع: ما سُجّل اليوم إن وُجد، وإلا آخر تسميع سابق (لفتح المصحف عليها). */
export function lastRecordedPos(s: DayStudent, kind: DayKind): [number, number] | null {
  const today = s[kind]?.segments;
  const last = today?.length
    ? today[today.length - 1]
    : kind === "memorize"
      ? s.last_memorize
      : s.last_review;
  const n = last ? surahNo(last.surah_name) : 0;
  return last && n ? [n, last.to_ayah] : null;
}

/* ─────────── اختصارات المدى (DR-22) ─────────── */

/** السورة كاملة. */
export function wholeSurah(n: number): QuranRange | null {
  const s = surahByNo(n);
  return s ? { fromSurah: n, fromAyah: 1, toSurah: n, toAyah: s.ayahs } : null;
}

/**
 * من الآية إلى آخر صفحتها في مصحف المدينة. في الاتجاه backward لا يتجاوز آخر السورة (السورة بعدها في
 * المصحف هي التي حُفظت قبلها).
 */
export function toPageEnd(
  surah: number,
  ayah: number,
  dir: RangeDirection = "forward",
): QuranRange | null {
  if (!surahByNo(surah) || ayah < 1 || ayah > surahByNo(surah).ayahs) return null;
  const next = PAGE_STARTS[pageOf(surah, ayah)];
  let end: [number, number];
  if (!next) end = [SURAHS.length, surahByNo(SURAHS.length).ayahs];
  else if (next[1] > 1) end = [next[0], next[1] - 1];
  else end = [next[0] - 1, surahByNo(next[0] - 1).ayahs];
  if (dir === "backward" && end[0] > surah) end = [surah, surahByNo(surah).ayahs];
  return { fromSurah: surah, fromAyah: ayah, toSurah: end[0], toAyah: end[1] };
}

/** مدى آخر تسميع (لـ«مثل آخر مراجعة»). */
export function rangeOfLast(last: Segment | null | undefined): QuranRange | null {
  const n = last ? surahNo(last.surah_name) : 0;
  return last && n
    ? { fromSurah: n, fromAyah: last.from_ayah, toSurah: n, toAyah: last.to_ayah }
    : null;
}

/**
 * يرتّب اختيار المصحف (لمستان بأي ترتيب) إلى مدى صحيح في الاتجاه المطلوب: في السورة الواحدة الآيات
 * تصاعدياً دائماً؛ وعبر السور forward بترتيب المصحف، وbackward من السورة الأكبر رقماً إلى الأصغر.
 */
export function orderPick(
  a: [number, number],
  b: [number, number],
  dir: RangeDirection = "forward",
): QuranRange {
  const asc = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);
  let [x, y] = asc ? [a, b] : [b, a];
  if (dir === "backward" && x[0] !== y[0]) [x, y] = [y, x];
  return { fromSurah: x[0], fromAyah: x[1], toSurah: y[0], toAyah: y[1] };
}

/** الآية التي تلي pos في الاتجاه: التالية في سورتها، ثم أول السورة التالية (أو السابقة في backward). */
export function nextPos(
  [s, a]: [number, number],
  dir: RangeDirection = "forward",
): [number, number] {
  const n = surahByNo(s)?.ayahs ?? 0;
  if (a < n) return [s, a + 1];
  const t = dir === "backward" ? s - 1 : s + 1;
  return t >= 1 && t <= SURAHS.length ? [t, 1] : [s, a];
}

/* ─────────── الدرجات ─────────── */

/** الدرجة 1..5 من درجة 0..100 (عكس grade_to_score على الخادم). */
export const scoreToGrade = (score: number | null | undefined): number | null =>
  score == null ? null : score >= 95 ? 5 : score >= 85 ? 4 : score >= 70 ? 3 : score >= 55 ? 2 : 1;

/* ─────────── الحالة والانتقالات ─────────── */

export const isPresent = (s: AttendanceStatus | null | undefined) =>
  s === "present" || s === "late";

export function canTransition(from: RecordStatus | null, to: RecordStatus): boolean {
  if (from === null) return to === "open";
  if (from === "open") return to === "completed";
  if (from === "completed") return to === "open" || to === "locked";
  return false;
}

/**
 * هل يكتب المستخدم في هذا السجل الآن؟ السجل غير المفتوح بعد قابل للكتابة لمن يحرّره: يُفتح ضمناً عند أول
 * لمسة (DR-06)، فلا خطوة «فتح سجل اليوم» قبل كل يوم.
 */
export const isWritable = (sheet: Pick<DaySheet, "can_edit" | "record"> | null | undefined) =>
  !!sheet?.can_edit && (!sheet.record || sheet.record.status === "open");

/* ─────────── التصفية والأيام (DR-08، DR-09، DR-21) ─────────── */

export type StudentFilter = "all" | "unmarked" | "idle" | "away";
export const STUDENT_FILTERS: readonly StudentFilter[] = ["all", "unmarked", "idle", "away"];

/** يطابق البحث بلا تشكيل ولا همزات (أحمد = احمد). */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A")
    .toLowerCase()
    .trim();
}

export function filterStudents(
  students: readonly DayStudent[],
  filter: StudentFilter,
  query = "",
): DayStudent[] {
  const q = normalizeName(query);
  return students.filter((s) => {
    if (q && !normalizeName(s.name).includes(q)) return false;
    if (filter === "unmarked") return !s.status && isMember(s);
    if (filter === "idle") return isPresent(s.status) && !s.memorize && !s.review;
    if (filter === "away") return s.status === "absent" || s.status === "excused";
    return true;
  });
}

/** الطالب التالي في القائمة المعروضة بعد الحالي (لـ«حفظ والتالي»)، أو null في آخرها. */
export function nextStudentId(list: readonly DayStudent[], current: string): string | null {
  const i = list.findIndex((s) => s.student_id === current);
  return i >= 0 && i + 1 < list.length ? list[i + 1].student_id : null;
}

/** اليوم بعد/قبل day بعدد n من الأيام (YYYY-MM-DD، بلا منطقة زمنية). */
export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  const p2 = (x: number) => String(x).padStart(2, "0");
  // أيام تقويم مجردة (لا لحظات): الحساب كله بـUTC فلا تُزاح بمنطقة الجهاز.
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}

/** أيام التحرير: اليوم وكل ما قبله بلا حدّ (كما على الخادم)؛ المستقبل وحده خارجها. */
export const inEditWindow = (day: string, today: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today;

/* ─────────── الملخص والتنبيهات (محسوبة لا مخزَّنة) ─────────── */

export interface DaySummary {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  unmarked: number;
  memorized: number;
  reviewed: number;
  evaluated: number;
  pages: number;
}

export function daySummary(all: readonly DayStudent[]): DaySummary {
  // من انتقل بلا أثر في اليوم لا يُعدّ (لا يظهر أصلاً)، ومن له أثر يُعدّ بحالته.
  const students = all.filter((x) => isMember(x) || x.status);
  const s: DaySummary = {
    total: students.length,
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    unmarked: 0,
    memorized: 0,
    reviewed: 0,
    evaluated: 0,
    pages: 0,
  };
  for (const st of students) {
    if (st.status) s[st.status]++;
    else s.unmarked++;
    if (st.memorize?.segments.length) {
      s.memorized++;
      const r = segmentsToRange(st.memorize.segments);
      if (r) s.pages += rangePages(r);
    }
    if (st.review?.segments.length) s.reviewed++;
    if (st.evaluation && EVAL_CRITERIA.some((c) => st.evaluation?.[c] != null)) s.evaluated++;
  }
  return s;
}

export type FinishWarning = "unmarked" | "presentWithoutWork" | "workWithoutGrade";
export interface FinishCheck {
  /** قاعدة إلزامية حقيقية (يرفضها الخادم أيضاً). */
  blocking: "noAttendance" | null;
  /** ids بترتيب names: لمس الاسم في نصف شاشة الإنهاء يفتح الطالب (1.14.0). */
  warnings: Array<{ kind: FinishWarning; names: string[]; ids: string[] }>;
}

export function finishCheck(students: readonly DayStudent[]): FinishCheck {
  const marked = students.filter((s) => s.status);
  const groups: Array<[FinishWarning, (s: DayStudent) => boolean]> = [
    ["unmarked", (s) => !s.status && isMember(s)],
    ["presentWithoutWork", (s) => isPresent(s.status) && !s.memorize && !s.review],
    ["workWithoutGrade", (s) => [s.memorize, s.review].some((w) => w && w.score == null)],
  ];
  const warnings: FinishCheck["warnings"] = [];
  for (const [kind, test] of groups) {
    const hit = students.filter(test);
    if (hit.length)
      warnings.push({ kind, names: hit.map((s) => s.name), ids: hit.map((s) => s.student_id) });
  }
  return { blocking: marked.length ? null : "noAttendance", warnings };
}

/* ─────────── الأخطاء ─────────── */

export const ERROR_CODES = [
  "VERSION_CONFLICT",
  "RECORD_LOCKED",
  "RECORD_COMPLETED",
  "RECORD_NOT_FOUND",
  "NOT_YOUR_HALAQA",
  "STUDENT_NOT_IN_HALAQA",
  "STUDENT_NOT_PRESENT",
  "HAS_ACHIEVEMENT",
  "NO_ATTENDANCE",
  "INVALID_DATE",
  "INVALID_RANGE",
  "INVALID_GRADE",
  "INVALID_EVALUATION",
  "INVALID_NOTES",
  "INVALID_TRANSITION",
  "FORBIDDEN",
  // DR-04: أكواد يرفعها الخادم ولم يكن لها نص (كانت تظهر «تعذّر الحفظ»)؛ يحرسها daily-record-quality.test.
  "AUTH_REQUIRED",
  "INVALID_STATUS",
  "INVALID_REASON",
  "INVALID_PAYLOAD",
  "INVALID_ERROR_TYPE",
  "INVALID_KIND",
  "INVALID_ROWS",
  // 1.14.0: استعادة يوم من سلّة المحذوفات وقد أُنشئ لليوم نفسه سجل جديد.
  "RECORD_EXISTS",
  // 1.14.0: اتجاه مدى غير forward/backward.
  "INVALID_DIRECTION",
  // 1.18.0: «يحتاج تصحيحاً» في عيّنة التدقيق بلا سبب.
  "REASON_REQUIRED",
] as const;
export type DailyErrorCode = (typeof ERROR_CODES)[number] | "NETWORK" | "UNKNOWN";

export function errorMessageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e)
    return String((e as { message: unknown }).message);
  return String(e ?? "");
}

export function dailyErrorCode(e: unknown, online = true): DailyErrorCode {
  const m = errorMessageOf(e);
  const hit = ERROR_CODES.find((c) => m.includes(c));
  if (hit) return hit;
  if (!online || /failed to fetch|network|offline|load failed/i.test(m)) return "NETWORK";
  return "UNKNOWN";
}

/* لوحة الطالب والقائمة (1.14.0): في daily-record-assist.ts. */
export { gradeFromMistakes, stepStudentId, suggestAmount } from "./daily-record-assist";
