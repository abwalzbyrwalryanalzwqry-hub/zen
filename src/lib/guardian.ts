import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/integrations/supabase/rpc";
import type { AssignmentKind, AssignmentStatus, AttendanceStatus } from "@/lib/zen-lms";
import type { MasteryLevel } from "@/lib/exam/types";

/**
 * بوابة ولي الأمر. الربط برمز يُصدره الطالب أو معلّم حلقته، والعرض للقراءة فقط
 * من دالة واحدة في قاعدة البيانات (guardian_child_overview) تتحقق من الربط.
 * لا يرى ولي الأمر المحاسبة الشخصية ولا المحادثات ولا التسجيلات ولا الهواتف.
 */

const db = supabase;

export type GuardianRelation = "father" | "mother" | "guardian";

/** ترتيب صلات القرابة في القائمة؛ أسماؤها في القاموس `guardianLink.relations.*`. */
export const RELATIONS: readonly GuardianRelation[] = ["father", "mother", "guardian"];

export const RELATION_LABEL: Record<GuardianRelation, string> = {
  father: "الأب",
  mother: "الأم",
  guardian: "ولي الأمر",
};

export type GuardianChild = {
  student_id: string;
  name: string;
  relation: GuardianRelation;
  linked_at: string;
};

export type StudentGuardian = {
  guardian_id: string;
  name: string;
  relation: GuardianRelation;
  linked_at: string;
};

export type ChildOverview = {
  student: { id: string; name: string } | null;
  halaqat: {
    id: string;
    name: string;
    schedule: string | null;
    teacher_id: string | null;
    teacher_name: string | null;
    center_name: string | null;
  }[];
  attendance_30d: Record<AttendanceStatus, number>;
  attendance: { date: string; status: AttendanceStatus; reason: string | null }[];
  assignments: {
    id: string;
    kind: AssignmentKind;
    surah_name: string;
    from_ayah: number;
    to_ayah: number;
    due_date: string;
    status: AssignmentStatus;
    instructions: string | null;
  }[];
  assessments: {
    id: string;
    score: number | null;
    approved: boolean;
    teacher_notes: string | null;
    created_at: string;
    surah_name: string;
    from_ayah: number;
    to_ayah: number;
  }[];
  exams: {
    id: string;
    title: string;
    percentage: number;
    mastery: MasteryLevel;
    created_at: string;
  }[];
  mushaf: { memorized_pages: number; last_session: string | null };
};

function clean(message: string): string {
  return message.replace(/^.*?:\s*/, "").trim() || "تعذّرت العملية.";
}

/** يوحّد الرمز كما تفعل قاعدة البيانات: أحرف وأرقام فقط، بحروف كبيرة. */
export function normalizeGuardianCode(input: string): string {
  return input.replace(/[^0-9a-z]/gi, "").toUpperCase();
}

/** يعرض الرمز على شكل مجموعتين يسهل إملاؤهما: ABCDE-12345. */
export function formatGuardianCode(code: string): string {
  const c = normalizeGuardianCode(code);
  return c.length > 5 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}

export async function createGuardianCode(
  studentId: string,
  relation: GuardianRelation,
): Promise<{ code: string; expires_at: string }> {
  const { data, error } = await rpc("create_guardian_code", {
    _student: studentId,
    _relation: relation,
  });
  if (error) throw new Error(clean(error.message));
  return data as { code: string; expires_at: string };
}

export async function claimGuardianCode(
  code: string,
): Promise<{ studentId: string; name: string }> {
  const { data, error } = await rpc("claim_guardian_code", { _code: normalizeGuardianCode(code) });
  if (error) throw new Error(clean(error.message));
  const r = data as { ok: boolean; error?: string; student_id?: string; name?: string };
  if (!r.ok) throw new Error(r.error ?? "الرمز غير صحيح.");
  return { studentId: r.student_id!, name: r.name ?? "طالب" };
}

export async function listMyChildren(): Promise<GuardianChild[]> {
  const { data, error } = await rpc("my_guardian_children");
  if (error) return [];
  return (data as GuardianChild[]) ?? [];
}

export async function listStudentGuardians(studentId: string): Promise<StudentGuardian[]> {
  const { data, error } = await rpc("student_guardians", { _student: studentId });
  if (error) return [];
  return (data as StudentGuardian[]) ?? [];
}

export async function getChildOverview(studentId: string): Promise<ChildOverview> {
  const { data, error } = await rpc("guardian_child_overview", { _student: studentId });
  if (error) throw new Error(clean(error.message));
  return data as ChildOverview;
}

/** يفكّ الربط: يستطيعه ولي الأمر أو الطالب أو معلّم الطالب. */
export async function removeGuardianLink(guardianId: string, studentId: string) {
  const { error } = await db
    .from("guardian_links")
    .delete()
    .eq("guardian_id", guardianId)
    .eq("student_id", studentId);
  if (error) throw new Error("تعذّر فكّ الربط.");
}

/** نسبة الحضور (الحاضر والمتأخر) من الحصص المسجّلة. */
export function attendanceRate(a: Record<AttendanceStatus, number>): number | null {
  const total = a.present + a.late + a.absent + a.excused;
  if (total === 0) return null;
  return Math.round(((a.present + a.late) / total) * 100);
}
