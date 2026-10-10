/**
 * «طلابي» بعد إعادة التنظيم (فحص الأقسام P1): التبويبات في الرابط، وفلترة الطلاب، ومؤشرات الرئيسية.
 * منطق خالص قدر الإمكان ليُختبر دون واجهة؛ العدّ نفسه من الخادم (`teacher_home_kpis`).
 */
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/integrations/supabase/rpc";

export const TEACHER_TABS = ["students", "review", "assign", "exams"] as const;
export type TeacherTab = (typeof TEACHER_TABS)[number];

export function parseTeacherTab(v: unknown): TeacherTab | undefined {
  return TEACHER_TABS.includes(v as TeacherTab) ? (v as TeacherTab) : undefined;
}

/** دون تبويب في الرابط: التسميعات إن كان فيها ما ينتظر، وإلا الطلاب. */
export function defaultTeacherTab(pending: number): TeacherTab {
  return pending > 0 ? "review" : "students";
}

export type TeacherKpis = {
  students: number;
  pending_recitations: number;
  attendance_marked: number;
  attendance_present: number;
  due_assignments: number;
  at_risk: number;
};

export async function fetchTeacherKpis(): Promise<TeacherKpis> {
  const { data, error } = await rpc("teacher_home_kpis");
  if (error) throw error;
  const r = (data ?? {}) as Partial<Record<keyof TeacherKpis, unknown>>;
  const n = (v: unknown) => Math.max(0, Number(v ?? 0) || 0);
  return {
    students: n(r.students),
    pending_recitations: n(r.pending_recitations),
    attendance_marked: n(r.attendance_marked),
    attendance_present: n(r.attendance_present),
    due_assignments: n(r.due_assignments),
    at_risk: n(r.at_risk),
  };
}

/** «حضر اليوم»: «—» قبل أي تسجيل، وإلا «حاضرون/مسجَّلون». */
export function attendanceRatio(k: Pick<TeacherKpis, "attendance_marked" | "attendance_present">) {
  return k.attendance_marked === 0 ? "—" : `${k.attendance_present}/${k.attendance_marked}`;
}

/** حلقات كل طالب من حلقات المعلّم (للفلترة)، خريطة: طالب ← معرّفات حلقاته. */
export async function fetchStudentHalaqat(halaqaIds: string[]): Promise<Record<string, string[]>> {
  if (halaqaIds.length === 0) return {};
  const { data, error } = await supabase
    .from("halaqa_students")
    .select("halaqa_id, student_id")
    .in("halaqa_id", halaqaIds);
  if (error) throw error;
  const out: Record<string, string[]> = {};
  for (const r of (data ?? []) as { halaqa_id: string; student_id: string }[]) {
    (out[r.student_id] ??= []).push(r.halaqa_id);
  }
  return out;
}

/** يطبّع الهمزات والتاء المربوطة والتشكيل ليجد «احمد» «أحمد». */
export function normalizeArabic(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .trim();
}

export function filterStudents<T extends { id: string; name: string }>(
  students: T[],
  opts: { q?: string; halaqa?: string | null; membership?: Record<string, string[]> },
): T[] {
  const q = normalizeArabic(opts.q ?? "");
  return students.filter((s) => {
    if (q && !normalizeArabic(s.name).includes(q)) return false;
    if (opts.halaqa && !(opts.membership?.[s.id] ?? []).includes(opts.halaqa)) return false;
    return true;
  });
}
