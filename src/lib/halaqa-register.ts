/**
 * سجل الحلقة السريع (9.1): حضور + تسميع + تقييم لكل طالب، يُحفظ بـ record_halaqa_session في
 * معاملة واحدة. بلا اتصال يُحفظ في صندوق إرسال على الجهاز ويُعاد إرساله؛ مفتاح (الحلقة، التاريخ،
 * الطالب) على الخادم يمنع التكرار.
 */
import { supabase } from "@/integrations/supabase/client";
import { isOnline } from "@/lib/network";

export type AttendanceStatus = "present" | "late" | "absent" | "excused";
export type ErrorType = "none" | "hifz" | "tajweed" | "tashkeel" | "waqf";

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "حاضر",
  late: "متأخر",
  absent: "غائب",
  excused: "معذور",
};
export const ERROR_LABEL: Record<ErrorType, string> = {
  none: "بلا أخطاء",
  hifz: "حفظ",
  tajweed: "تجويد",
  tashkeel: "تشكيل",
  waqf: "وقف وابتداء",
};

export interface SheetRow {
  student_id: string;
  name: string;
  status: AttendanceStatus | null;
  entry: {
    surah_name: string;
    from_ayah: number;
    to_ayah: number;
    kind: "memorize" | "review";
    score: number | null;
    errors: Array<{ type: ErrorType }> | null;
    notes: string | null;
  } | null;
  last: { surah_name: string; to_ayah: number; kind: string; session_date: string } | null;
}

export interface DraftRow {
  student_id: string;
  status: AttendanceStatus;
  surah_name: string;
  from_ayah: number | null;
  to_ayah: number | null;
  kind: "memorize" | "review";
  grade: number | null;
  error_type: ErrorType;
  notes: string;
}

const CYCLE: AttendanceStatus[] = ["present", "late", "absent", "excused"];
export const nextStatus = (s: AttendanceStatus): AttendanceStatus =>
  CYCLE[(CYCLE.indexOf(s) + 1) % CYCLE.length];

export const scoreToGrade = (score: number | null | undefined): number | null =>
  score == null ? null : score >= 95 ? 5 : score >= 85 ? 4 : score >= 70 ? 3 : score >= 55 ? 2 : 1;

/** مسودة الصف: قيد اليوم إن وُجد، وإلا اقتراح «من» التالي بعد آخر تسميع حفظ. */
export function draftFromSheet(r: SheetRow): DraftRow {
  if (r.entry)
    return {
      student_id: r.student_id,
      status: r.status ?? "present",
      surah_name: r.entry.surah_name,
      from_ayah: r.entry.from_ayah,
      to_ayah: r.entry.to_ayah,
      kind: r.entry.kind,
      grade: scoreToGrade(r.entry.score),
      error_type: r.entry.errors?.[0]?.type ?? "none",
      notes: r.entry.notes ?? "",
    };
  return {
    student_id: r.student_id,
    status: r.status ?? "present",
    surah_name: r.last?.surah_name ?? "",
    from_ayah: r.last ? r.last.to_ayah + 1 : null,
    to_ayah: null,
    kind: "memorize",
    grade: null,
    error_type: "none",
    notes: "",
  };
}

/** صفوف الإرسال: التسميع يُرسل للحاضر/المتأخر ذي السورة والدرجة فقط. */
export function rowsForSave(drafts: DraftRow[]) {
  return drafts.map((d) => {
    const recited =
      (d.status === "present" || d.status === "late") &&
      d.surah_name.trim() &&
      d.from_ayah &&
      d.grade;
    return recited
      ? {
          student_id: d.student_id,
          status: d.status,
          surah_name: d.surah_name.trim(),
          from_ayah: d.from_ayah,
          to_ayah: d.to_ayah ?? d.from_ayah,
          kind: d.kind,
          grade: d.grade,
          error_type: d.error_type,
          notes: d.notes.trim() || null,
        }
      : { student_id: d.student_id, status: d.status };
  });
}

/** صف ناقص: بدأ المعلّم التسميع ولم يكمل الدرجة أو المدى. */
export function incompleteRows(drafts: DraftRow[]): string[] {
  return drafts
    .filter(
      (d) =>
        (d.status === "present" || d.status === "late") &&
        d.surah_name.trim() &&
        (!d.grade || !d.from_ayah || (d.to_ayah != null && d.to_ayah < d.from_ayah)),
    )
    .map((d) => d.student_id);
}

export async function fetchRegisterSheet(halaqa: string, date: string): Promise<SheetRow[]> {
  const { data, error } = await supabase.rpc("halaqa_register_sheet", {
    _halaqa: halaqa,
    _date: date,
  });
  if (error) throw error;
  return (data as unknown as SheetRow[]) ?? [];
}

export async function saveRegister(
  halaqa: string,
  date: string,
  rows: ReturnType<typeof rowsForSave>,
) {
  const { data, error } = await supabase.rpc("record_halaqa_session", {
    _halaqa: halaqa,
    _date: date,
    _rows: rows as never,
  });
  if (error) throw error;
  return data as unknown as { created: number; updated: number; reviews: number };
}

/** رسالة الخطأ: أخطاء Supabase كائنات فيها `message` لا `Error`. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

export const isNetworkError = (e: unknown) =>
  !isOnline() || /fetch|network|offline|اتصال/i.test(errorText(e));

/* ─────────── صندوق الإرسال بلا اتصال ─────────── */

export type RegisterOutboxItem = {
  halaqa: string;
  date: string;
  rows: ReturnType<typeof rowsForSave>;
  saved_at: string;
};
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const KEY = "zen.register.outbox";

function store(): Store | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readRegisterOutbox(s: Store | null = store()): RegisterOutboxItem[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s.getItem(KEY) ?? "[]") as RegisterOutboxItem[];
    return Array.isArray(v)
      ? v.filter((x) => x && x.halaqa && x.date && Array.isArray(x.rows))
      : [];
  } catch {
    return [];
  }
}

/** يضيف سجلاً أو يستبدل سجل الحلقة واليوم نفسيهما (آخر نسخة هي المعتمدة). */
export function queueRegister(item: RegisterOutboxItem, s: Store | null = store()) {
  if (!s) return;
  const rest = readRegisterOutbox(s).filter(
    (x) => !(x.halaqa === item.halaqa && x.date === item.date),
  );
  s.setItem(KEY, JSON.stringify([...rest, item]));
}

/** يرسل المعلّق بالترتيب؛ ما فشل بسبب الشبكة يبقى، وما رفضه الخادم يُعاد مع سببه. */
export async function flushRegisterOutbox(
  send: (i: RegisterOutboxItem) => Promise<unknown> = (i) => saveRegister(i.halaqa, i.date, i.rows),
  s: Store | null = store(),
): Promise<{ sent: number; rejected: Array<{ item: RegisterOutboxItem; message: string }> }> {
  const items = readRegisterOutbox(s);
  const keep: RegisterOutboxItem[] = [];
  const rejected: Array<{ item: RegisterOutboxItem; message: string }> = [];
  let sent = 0;
  for (const item of items) {
    try {
      await send(item);
      sent++;
    } catch (e) {
      const message = errorText(e);
      if (isNetworkError(e)) keep.push(item);
      else rejected.push({ item, message });
    }
  }
  if (s) {
    if (keep.length) s.setItem(KEY, JSON.stringify(keep));
    else s.removeItem(KEY);
  }
  return { sent, rejected };
}

export function registerErrorMessage(e: unknown): string {
  const m = errorText(e);
  if (m.includes("NOT_YOUR_HALAQA")) return "هذه الحلقة ليست من حلقاتك.";
  if (m.includes("STUDENT_NOT_IN_HALAQA")) return "أحد الطلاب لم يعد في الحلقة. حدّث القائمة.";
  if (m.includes("INVALID_DATE")) return "التاريخ خارج المسموح (اليوم أو آخر 14 يوماً).";
  if (m.includes("INVALID_RANGE")) return "مدى الآيات غير صحيح.";
  if (m.includes("INVALID_GRADE")) return "الدرجة من 1 إلى 5.";
  return "تعذّر حفظ السجل.";
}
