/**
 * إدارة المعلّم لطلابه (supabase/migrations/20261127100000_teacher_manage_students.sql): تعديل اسم حساب
 * أنشأه معلّم، وإزالة الطالب من حلقة يديرها. التحقق كله في قاعدة البيانات؛ هنا ترجمة الأكواد إلى مفاتيح نصوص.
 */
import { rpc } from "@/integrations/supabase/rpc";
import { supabase } from "@/integrations/supabase/client";
import { listHalaqat } from "@/lib/zen-api";

export type ManageErrorCode =
  "not_allowed" | "not_managed" | "invalid_name" | "not_member" | "network" | "unknown";

export function manageErrorCode(e: unknown): ManageErrorCode {
  const m =
    e && typeof e === "object" && "message" in e
      ? String((e as { message: unknown }).message)
      : String(e ?? "");
  for (const c of ["not_managed", "invalid_name", "not_member", "not_allowed"] as const)
    if (m.includes(c)) return c;
  if (/failed to fetch|network|offline|load failed/i.test(m)) return "network";
  return "unknown";
}

export async function teacherUpdateStudent(student: string, name: string) {
  const { data, error } = await rpc("teacher_update_student", { _student: student, _name: name });
  if (error) throw error;
  return data as { student_id: string; name: string };
}

/** يزيل الطالب من الحلقة المحدّدة، أو من كل حلقات المعلّم إن لم تُحدَّد. يعيد عدد الحلقات. */
export async function teacherRemoveStudent(student: string, halaqa: string | null = null) {
  const { data, error } = await rpc("teacher_remove_student", {
    _student: student,
    ...(halaqa ? { _halaqa: halaqa } : {}),
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/** حلقات المعلّم التي فيها هذا الطالب (لعرض «إزالة من حلقة …»). */
export async function myHalaqatOfStudent(me: string, student: string) {
  const mine = (await listHalaqat()).filter((h) => h.teacher_id === me);
  if (!mine.length) return [];
  const { data, error } = await supabase
    .from("halaqa_students")
    .select("halaqa_id")
    .eq("student_id", student)
    .in(
      "halaqa_id",
      mine.map((h) => h.id),
    );
  if (error) throw error;
  const ids = new Set(((data ?? []) as { halaqa_id: string }[]).map((r) => r.halaqa_id));
  return mine.filter((h) => ids.has(h.id)).map((h) => ({ id: h.id, name: h.name }));
}
