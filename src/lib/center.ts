import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/integrations/supabase/rpc";
import type { AssignmentKind, AssignmentStatus, AttendanceStatus } from "@/lib/zen-lms";
import type { MasteryLevel } from "@/lib/exam/types";
import { AR_LATN } from "@/lib/i18n";

/**
 * إدارة المراكز والتقارير (المرحلة 11).
 * كل البيانات المجمّعة تأتي من دوال SECURITY DEFINER في قاعدة البيانات تتحقق من
 * عضوية طاقم المركز؛ لا يقرأ الطاقم جداول الطلاب مباشرة.
 */

const db = supabase;

export type StaffRole = "manager" | "supervisor";
export type CenterRole = StaffRole | "owner";

export const STAFF_ROLE_LABEL: Record<CenterRole, string> = {
  owner: "المنشئ",
  manager: "مدير",
  supervisor: "مشرف تعليمي",
};

export const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export type RiskReason = "low_attendance" | "absent_streak" | "low_score" | "inactive";

export const RISK_LABEL: Record<RiskReason, string> = {
  low_attendance: "حضور أقل من 60%",
  absent_streak: "غياب آخر 3 حصص",
  low_score: "متوسط التسميع أقل من 60",
  inactive: "لا نشاط منذ 14 يوماً",
};

export type ManagedCenter = {
  center_id: string;
  name: string;
  city: string | null;
  role: CenterRole;
};

export type StaffMember = { user_id: string; name: string; role: StaffRole; created_at: string };

export type ScheduleSlot = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  location: string | null;
  online_url: string | null;
};

export type MyScheduleSlot = {
  slot_id: string;
  halaqa_id: string;
  halaqa_name: string;
  center_name: string | null;
  teacher_name: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  location: string | null;
  online_url: string | null;
  as_role: "student" | "teacher" | "guardian";
  child_name: string | null;
};

export type CenterDashboard = {
  center: { id: string; name: string; city: string | null } | null;
  period_days: number;
  since: string;
  can_manage: boolean;
  totals: {
    halaqat: number;
    students: number;
    teachers: number;
    weekly_slots: number;
    attendance_records: number;
    attendance_rate: number | null;
    pages_memorized: number;
    assessments: number;
    avg_score: number | null;
    exams: number;
    avg_exam: number | null;
    at_risk: number;
  };
  halaqat: {
    id: string;
    name: string;
    teacher_id: string | null;
    teacher_name: string | null;
    students: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    pages_memorized: number;
    assessments: number;
    avg_score: number | null;
    avg_exam: number | null;
    slots: ScheduleSlot[];
  }[];
  teachers: {
    id: string;
    name: string | null;
    halaqat: number;
    students: number;
    attendance_marked: number;
    assessments: number;
    assignments: number;
    last_activity: string | null;
  }[];
  at_risk: {
    id: string;
    name: string;
    halaqat: string | null;
    attendance_rate: number | null;
    avg_score: number | null;
    last_activity: string | null;
    reasons: RiskReason[];
  }[];
  weekly: { week: string; records: number; rate: number | null }[];
};

export type StudentReport = {
  student: { id: string; name: string } | null;
  from: string;
  to: string;
  halaqat: { name: string; teacher_name: string | null; center_name: string | null }[];
  attendance_summary: Record<AttendanceStatus, number>;
  attendance: { date: string; status: AttendanceStatus; reason: string | null }[];
  mushaf_summary: {
    memorized_pages: number;
    reviewed_pages: number;
    consolidated_pages: number;
    avg_rating: number | null;
  };
  mushaf: {
    date: string;
    page: number;
    kind: "memorize" | "review" | "consolidate";
    rating: number | null;
    notes: string | null;
  }[];
  assessments: {
    date: string;
    surah_name: string;
    from_ayah: number;
    to_ayah: number;
    score: number | null;
    approved: boolean;
    teacher_notes: string | null;
  }[];
  assignments: {
    due_date: string;
    kind: AssignmentKind;
    surah_name: string;
    from_ayah: number;
    to_ayah: number;
    status: AssignmentStatus;
  }[];
  exams: { date: string; title: string; percentage: number; mastery: MasteryLevel }[];
};

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

// ─── الطاقم ───
export async function myManagedCenters(): Promise<ManagedCenter[]> {
  const { data, error } = await rpc("my_managed_centers");
  if (error) fail(error, "تعذّر تحميل المراكز.");
  return (data ?? []) as ManagedCenter[];
}

export async function listCenterStaff(centerId: string): Promise<StaffMember[]> {
  const { data, error } = await rpc("center_staff_list", { _center: centerId });
  if (error) fail(error, "تعذّر تحميل الطاقم.");
  return (data ?? []) as StaffMember[];
}

export async function createStaffCode(
  centerId: string,
  role: StaffRole,
): Promise<{ code: string; role: StaffRole; expires_at: string }> {
  const { data, error } = await rpc("create_center_staff_code", { _center: centerId, _role: role });
  if (error) fail(error, "تعذّر إصدار الرمز.");
  return data as unknown as { code: string; role: StaffRole; expires_at: string };
}

export async function claimStaffCode(
  code: string,
): Promise<{ center_id: string; center_name: string; role: StaffRole }> {
  const { data, error } = await rpc("claim_center_staff_code", { _code: code });
  if (error) fail(error, "تعذّر استخدام الرمز.");
  const res = data as unknown as {
    ok?: boolean;
    error?: string;
    center_id: string;
    center_name: string;
    role: StaffRole;
  } | null;
  if (!res?.ok) throw new Error(res?.error || "الرمز غير صحيح.");
  return res;
}

export async function removeStaff(centerId: string, userId: string): Promise<void> {
  const { data, error } = await db
    .from("center_staff")
    .delete()
    .eq("center_id", centerId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) fail(error, "تعذّر الحذف.");
  // RLS تُرجع نجاحاً بلا صفوف لمن لا يملك الحذف: لا نعرض «تمّت الإزالة» والعضو باقٍ.
  if (!data?.length) throw new Error("لم تُحذف العضوية: لا تملك صلاحية إدارة طاقم هذا المركز.");
}

// ─── المواعيد ───
export async function listSchedule(halaqaId: string): Promise<ScheduleSlot[]> {
  const { data, error } = await db
    .from("halaqa_schedule")
    .select("id, weekday, start_time, end_time, location, online_url")
    .eq("halaqa_id", halaqaId)
    .order("weekday")
    .order("start_time");
  if (error) fail(error, "تعذّر تحميل المواعيد.");
  return ((data ?? []) as ScheduleSlot[]).map((s) => ({
    ...s,
    start_time: hhmm(s.start_time),
    end_time: hhmm(s.end_time),
  }));
}

export async function addScheduleSlot(
  halaqaId: string,
  slot: Omit<ScheduleSlot, "id">,
): Promise<void> {
  const err = validateSlot(slot);
  if (err) throw new Error(err);
  const { data: u } = await supabase.auth.getUser();
  const { error } = await db.from("halaqa_schedule").insert({
    halaqa_id: halaqaId,
    weekday: slot.weekday,
    start_time: slot.start_time,
    end_time: slot.end_time,
    location: slot.location?.trim() || null,
    online_url: slot.online_url?.trim() || null,
    created_by: u.user?.id,
  });
  if (error) fail(error, "تعذّر حفظ الموعد (هل تملك إدارة هذه الحلقة؟).");
}

export async function deleteScheduleSlot(id: string): Promise<void> {
  const { data, error } = await db.from("halaqa_schedule").delete().eq("id", id).select("id");
  if (error) fail(error, "تعذّر حذف الموعد.");
  if (!data?.length) throw new Error("لم يُحذف الموعد: لا تملك صلاحية تعديل مواعيد هذه الحلقة.");
}

export async function myHalaqaSchedule(): Promise<MyScheduleSlot[]> {
  const { data, error } = await rpc("my_halaqa_schedule");
  if (error) fail(error, "تعذّر تحميل المواعيد.");
  return ((data ?? []) as MyScheduleSlot[]).map((s) => ({
    ...s,
    start_time: hhmm(s.start_time),
    end_time: hhmm(s.end_time),
  }));
}

// ─── اللوحة والتقارير ───
export async function getCenterDashboard(centerId: string, days: number): Promise<CenterDashboard> {
  const { data, error } = await rpc("center_dashboard", { _center: centerId, _days: days });
  if (error) fail(error, "تعذّر تحميل لوحة المركز.");
  return data as CenterDashboard;
}

/* ─── مؤشرات المركز (10.3) ─── */
export type HalaqaKpi = {
  id: string;
  name: string;
  students: number;
  pages_30: number;
  pages_per_student: number | null;
  regularity: number | null;
  dropouts: number;
  dropout_rate: number | null;
};
export type MonthlyKpi = {
  month: string;
  pages: number;
  attendance_rate: number | null;
  active_students: number;
};
export type CenterKpis = {
  months: number;
  halaqat: HalaqaKpi[];
  totals: { students: number; pages_30: number; dropouts: number; regularity: number | null };
  monthly: MonthlyKpi[];
};

export async function getCenterKpis(centerId: string, months = 6): Promise<CenterKpis> {
  const { data, error } = await rpc("center_kpis", { _center: centerId, _months: months });
  if (error) fail(error, "تعذّر تحميل مؤشرات المركز.");
  return data as unknown as CenterKpis;
}

/** اسم الشهر بالعربية من «YYYY-MM». */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat(AR_LATN, { month: "short" }).format(new Date(y, m - 1, 1));
  } catch {
    return ym;
  }
}

export async function listCenterStudents(
  centerId: string,
): Promise<{ student_id: string; name: string; halaqat: string }[]> {
  const { data, error } = await rpc("center_students", { _center: centerId });
  if (error) fail(error, "تعذّر تحميل الطلاب.");
  return data ?? [];
}

export async function getStudentReport(
  studentId: string,
  from: string,
  to: string,
): Promise<StudentReport> {
  const { data, error } = await rpc("student_report", {
    _student: studentId,
    _from: from,
    _to: to,
  });
  if (error) fail(error, "تعذّر تحميل التقرير.");
  return data as StudentReport;
}

// ─── دوال بحتة (مختبَرة) ───

/** "05:30:00" ← "05:30" */
export function hhmm(t: string): string {
  return (t ?? "").slice(0, 5);
}

export function validateSlot(slot: Omit<ScheduleSlot, "id">): string | null {
  if (!Number.isInteger(slot.weekday) || slot.weekday < 0 || slot.weekday > 6) return "اختر يوماً.";
  if (!/^\d{2}:\d{2}$/.test(slot.start_time) || !/^\d{2}:\d{2}$/.test(slot.end_time))
    return "أدخل وقتي البداية والنهاية.";
  if (slot.end_time <= slot.start_time) return "وقت النهاية يجب أن يكون بعد البداية.";
  const url = slot.online_url?.trim();
  if (url && !/^https:\/\//.test(url)) return "رابط الحلقة يجب أن يبدأ بـ https://";
  if ((slot.location ?? "").length > 120) return "المكان طويل جداً.";
  return null;
}

/** مواعيد يوم معيّن مرتبة بالوقت. */
export function slotsForDay<T extends { weekday: number; start_time: string }>(
  slots: T[],
  date: Date,
): T[] {
  const d = date.getDay();
  return slots
    .filter((s) => s.weekday === d)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export function slotLabel(s: { weekday: number; start_time: string; end_time: string }): string {
  return `${WEEKDAYS[s.weekday] ?? ""} ${hhmm(s.start_time)}–${hhmm(s.end_time)}`;
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysAgo(n: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

export function attendanceRate(s: Partial<Record<AttendanceStatus, number>>): number | null {
  const present = (s.present ?? 0) + (s.late ?? 0);
  const total = present + (s.absent ?? 0) + (s.excused ?? 0);
  return total === 0 ? null : Math.round((present * 100) / total);
}

/** حدود شهر «YYYY-MM» تاريخين ISO (أول يوم وآخره)، أو null لصيغة غير صحيحة (11.2). */
export function monthRange(ym: string | undefined | null): { from: string; to: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ym ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}` };
}
