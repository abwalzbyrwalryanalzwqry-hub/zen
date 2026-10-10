import { supabase } from "@/integrations/supabase/client";
import { kickPushSoon } from "./push";
import { addLocalDays, localDayKey } from "@/lib/local-day";
export * from "./zen-stories";

/** عميل بأنواع مرنة للجداول والدوال التي لم تُولَّد أنواعها بعد (assignments، recitation_sessions، attendance…). */
const db = supabase;

/* ─────────── Types ─────────── */

export type AssignmentKind = "memorize" | "review" | "test";
export type AssignmentStatus = "pending" | "submitted" | "approved" | "redo";

export type Assignment = {
  id: string;
  student_id: string;
  teacher_id: string | null;
  halaqa_id: string | null;
  kind: AssignmentKind;
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
  instructions: string | null;
  due_date: string;
  status: AssignmentStatus;
  created_at: string;
};

export type RecitationStatus =
  "recording" | "uploading" | "practice" | "awaiting_teacher" | "approved" | "redo";

export type RecitationSession = {
  id: string;
  student_id: string;
  assignment_id: string | null;
  halaqa_id: string | null;
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
  kind: AssignmentKind;
  audio_path: string | null;
  duration_seconds: number | null;
  status: RecitationStatus;
  session_date: string;
  /** يكتبها الخادم وحده بعد التحليل الآلي (مُشغّل recitation_sessions_guard). */
  transcript?: string | null;
  ai_score?: number | null;
  ai_analysis?: { weakSpots?: string[]; coach?: string } | null;
  created_at: string;
};

export type RecitationError = { type: string; note: string };

export type RecitationAssessment = {
  id: string;
  session_id: string;
  student_id: string;
  teacher_id: string | null;
  score: number | null;
  errors: RecitationError[];
  teacher_notes: string | null;
  ai_summary: string | null;
  ai_confidence: number | null;
  next_review_date: string | null;
  approved: boolean;
  created_at: string;
};

export type AttendanceStatus = "present" | "late" | "absent" | "excused";

export type AttendanceRow = {
  id: string;
  student_id: string;
  halaqa_id: string | null;
  session_date: string;
  status: AttendanceStatus;
  reason: string | null;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

/* ─────────── Labels ─────────── */

export const KIND_LABEL: Record<AssignmentKind, string> = {
  memorize: "حفظ جديد",
  review: "مراجعة",
  test: "اختبار",
};

export const RECITATION_STATUS_LABEL: Record<RecitationStatus, string> = {
  recording: "قيد التسجيل",
  uploading: "قيد الرفع",
  practice: "تدريب ذاتي",
  awaiting_teacher: "بانتظار المعلم",
  approved: "معتمد",
  redo: "يحتاج إعادة",
};

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "حاضر",
  late: "متأخر",
  absent: "غائب",
  excused: "بعذر",
};

/** اليوم المحلي للمعلّم (تاريخ الحضور وموعد الواجب) — لا يوم UTC (تدقيق 1.1). */
export const todayISO = () => localDayKey();

/* ─────────── Assignments ─────────── */

export async function listMyAssignments(studentId: string): Promise<Assignment[]> {
  const { data } = await db
    .from("assignments")
    .select("*")
    .eq("student_id", studentId)
    .order("due_date", { ascending: true })
    .limit(100);
  return (data as Assignment[]) ?? [];
}

export async function listTeacherAssignments(limit = 100): Promise<Assignment[]> {
  const { data } = await db
    .from("assignments")
    .select("*")
    .order("due_date", { ascending: false })
    .limit(limit);
  return (data as Assignment[]) ?? [];
}

export async function addAssignment(input: {
  student_id: string;
  teacher_id: string;
  halaqa_id?: string | null;
  kind: AssignmentKind;
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
  instructions?: string | null;
  due_date: string;
}) {
  const { error } = await db.from("assignments").insert(input);
  if (error) {
    // 42501: رفض سياسة RLS — الطالب أو الحلقة ليسا من حلقات هذا المعلّم.
    if (error.code === "42501") throw new Error("لا يمكنك إسناد واجب إلا لطلاب حلقاتك.");
    throw error;
  }
  await notify(input.student_id, {
    kind: "assignment",
    title: "واجب جديد",
    body: `سورة ${input.surah_name} · الآيات ${input.from_ayah}–${input.to_ayah}`,
    link: "/today",
  });
}

export async function setAssignmentStatus(id: string, status: AssignmentStatus) {
  const { error } = await db.from("assignments").update({ status }).eq("id", id);
  if (error) throw error;
}

/* ─────────── Recitations ─────────── */

export const RECITATION_BUCKET = "recitations";

export async function uploadRecitationAudio(studentId: string, blob: Blob): Promise<string> {
  const path = `${studentId}/${Date.now()}.webm`;
  const { error } = await supabase.storage
    .from(RECITATION_BUCKET)
    .upload(path, blob, { contentType: blob.type || "audio/webm", upsert: false });
  if (error) throw error;
  return path;
}

export async function getRecitationAudioUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(RECITATION_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function createRecitationSession(input: {
  student_id: string;
  assignment_id?: string | null;
  halaqa_id?: string | null;
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
  kind: AssignmentKind;
  audio_path: string | null;
  duration_seconds: number;
  /** «practice» للتسميع الذاتي: لا يصل المعلّم حتى يرسله الطالب. */
  status?: "practice" | "awaiting_teacher";
}): Promise<string> {
  const { status = "awaiting_teacher", ...rest } = input;
  const { data, error } = await db
    .from("recitation_sessions")
    .insert({ ...rest, status })
    .select("id")
    .single();
  if (error) throw error;
  if (input.assignment_id) await setAssignmentStatus(input.assignment_id, "submitted");
  return (data as { id: string }).id;
}

/** يرسل الطالب تسميعه الذاتي إلى معلّمه (من «تدريب ذاتي» إلى «بانتظار المعلم»). */
export async function submitPracticeToTeacher(sessionId: string) {
  const { error } = await db
    .from("recitation_sessions")
    .update({ status: "awaiting_teacher" })
    .eq("id", sessionId);
  if (error) throw new Error("تعذّر الإرسال إلى المعلّم.");
}

export async function listMyRecitations(
  studentId: string,
  limit = 50,
): Promise<RecitationSession[]> {
  const { data } = await db
    .from("recitation_sessions")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as RecitationSession[]) ?? [];
}

// الأقدم أولاً (طابور عادل: من أرسل أولاً يُقيَّم أولاً)، والخطأ يُرمى ليظهر «تعذّر التحميل» لا قائمة فارغة.
export async function listPendingRecitations(limit = 50): Promise<RecitationSession[]> {
  const { data, error } = await db
    .from("recitation_sessions")
    .select("*")
    .eq("status", "awaiting_teacher")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data as RecitationSession[]) ?? [];
}

export async function deleteRecitation(session: RecitationSession) {
  if (session.audio_path) {
    try {
      await supabase.storage.from(RECITATION_BUCKET).remove([session.audio_path]);
    } catch {
      /* keep going even if the file is already gone */
    }
  }
  const { error } = await db.from("recitation_sessions").delete().eq("id", session.id);
  if (error) throw error;
}

/* ─────────── Assessments ─────────── */

/**
 * @deprecated جدولة ثابتة بلا ذاكرة للمقطع. الجدولة الحقيقية تجري الآن في
 * قاعدة البيانات بخوارزمية SM-2 عبر apply_review (انظر assessRecitation).
 * تبقى هذه الدالة لعرض تقدير مبدئي فقط.
 */
export function nextReviewDays(score: number): number {
  if (score < 60) return 1;
  if (score < 80) return 2;
  if (score < 90) return 5;
  return 21;
}

export function addDaysISO(days: number): string {
  return addLocalDays(days);
}

export type ReviewCard = {
  id: string;
  student_id: string;
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
  ease: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  last_score: number | null;
  last_reviewed_at: string | null;
  due_date: string;
};

export type ReviewSchedule = {
  due_date: string;
  interval_days: number;
  ease: number;
  repetitions: number;
};

/**
 * تقييم التسميع مع جدولة المراجعة القادمة بخوارزمية SM-2 في قاعدة البيانات.
 *
 * سابقاً كان الموعد = دالة ثابتة من الدرجة فقط، فمقطع رُوجع بنجاح عشر مرات
 * يُعامَل كمقطع جديد ولا تتباعد الفواصل. الآن لكل مقطع بطاقة تحمل معامل سهولة
 * وفاصلاً ومكرّرات، فتتباعد المراجعة مع الإتقان وتعود إلى يوم واحد عند التعثّر.
 */
export async function assessRecitation(input: {
  session_id: string;
  student_id: string;
  teacher_id: string;
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
  score: number;
  errors: RecitationError[];
  teacher_notes?: string | null;
  ai_summary?: string | null;
  ai_confidence?: number | null;
  approved: boolean;
}): Promise<ReviewSchedule> {
  const { surah_name, from_ayah, to_ayah, ...assessment } = input;

  const { data: scheduleRows, error: scheduleError } = await db.rpc("apply_review", {
    _student_id: input.student_id,
    _surah_name: surah_name,
    _from_ayah: from_ayah,
    _to_ayah: to_ayah,
    _score: input.score,
  });
  if (scheduleError) {
    if (scheduleError.message?.includes("NOT_ALLOWED")) {
      throw new Error("لا تملك صلاحية تقييم هذا الطالب.");
    }
    throw scheduleError;
  }

  const schedule: ReviewSchedule = Array.isArray(scheduleRows)
    ? scheduleRows[0]
    : (scheduleRows as ReviewSchedule);
  const next_review_date = schedule?.due_date ?? addDaysISO(nextReviewDays(input.score));

  const { error } = await db
    .from("recitation_assessments")
    .insert({ ...assessment, next_review_date });
  if (error) throw error;

  // التقييم حُفظ؛ فشل تحديث الحالة يُعرض كي لا يبقى التسميع «بانتظار التقييم» بصمت.
  const { error: statusError } = await db
    .from("recitation_sessions")
    .update({ status: input.approved ? "approved" : "redo" })
    .eq("id", input.session_id);
  if (statusError) throw statusError;

  await notify(input.student_id, {
    kind: "assessment",
    title: input.approved ? "تم اعتماد تسميعك" : "تسميعك يحتاج إعادة",
    body: `الدرجة: ${input.score}/100 · المراجعة القادمة: ${next_review_date}`,
    link: "/today",
  });

  return { ...schedule, due_date: next_review_date };
}

/** المقاطع المستحقّة للمراجعة اليوم (بترتيب الأقدم استحقاقاً). */
export async function listDueReviews(limit = 20): Promise<ReviewCard[]> {
  const { data, error } = await db.rpc("due_reviews", { _limit: limit });
  if (error) throw error;
  return (data as ReviewCard[]) ?? [];
}

/** بطاقات مراجعة طالب (للمعلّم أو للطالب نفسه). */
export async function listReviewCards(studentId: string, limit = 100): Promise<ReviewCard[]> {
  const { data } = await db
    .from("review_cards")
    .select("*")
    .eq("student_id", studentId)
    .order("due_date", { ascending: true })
    .limit(limit);
  return (data as ReviewCard[]) ?? [];
}

export async function listAssessmentsForStudent(
  studentId: string,
  limit = 50,
): Promise<RecitationAssessment[]> {
  const { data } = await db
    .from("recitation_assessments")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as unknown as RecitationAssessment[]) ?? [];
}

/* ─────────── Attendance ─────────── */

export async function listAttendance(opts: {
  halaqaId?: string | null;
  date?: string;
  studentId?: string;
}) {
  let q = db.from("attendance").select("*").order("session_date", { ascending: false });
  if (opts.halaqaId) q = q.eq("halaqa_id", opts.halaqaId);
  if (opts.date) q = q.eq("session_date", opts.date);
  if (opts.studentId) q = q.eq("student_id", opts.studentId);
  const { data, error } = await q.limit(300);
  if (error) throw error;
  return (data as AttendanceRow[]) ?? [];
}

/**
 * تسجيل الحضور عبر دالة قاعدة البيانات mark_attendance.
 *
 * upsert من العميل كان يفشل في منع التكرار: الفهرس الفريد لا يشمل الصفوف التي
 * halaqa_id فيها NULL (وهو ما يحدث تلقائياً عند حذف حلقة)، فيُضاف صف جديد لكل
 * تسجيل ⇒ إحصاءات حضور مضاعفة. الدالة تُجري الدمج على الخادم وتتحقق من الدور.
 */
export async function markAttendance(input: {
  student_id: string;
  halaqa_id: string | null;
  session_date: string;
  status: AttendanceStatus;
  reason?: string | null;
}) {
  const { error } = await db.rpc("mark_attendance", {
    _student_id: input.student_id,
    _halaqa_id: input.halaqa_id,
    _session_date: input.session_date,
    _status: input.status,
    _reason: input.reason ?? null,
  });
  if (error) {
    if (error.message?.includes("TEACHER_ONLY")) throw new Error("تسجيل الحضور متاح للمعلمين فقط.");
    if (error.message?.includes("NOT_YOUR_STUDENT"))
      throw new Error("هذا الطالب ليس في إحدى حلقاتك.");
    if (error.message?.includes("NOT_YOUR_HALAQA"))
      throw new Error("الطالب ليس عضواً في هذه الحلقة، أو الحلقة ليست حلقتك.");
    if (error.message?.includes("INVALID_STATUS")) throw new Error("حالة حضور غير صحيحة.");
    if (error.message?.includes("FUTURE_DATE"))
      throw new Error("لا يمكن تسجيل حضور بتاريخ مستقبلي.");
    throw error;
  }
  if (input.status === "absent") void kickPushSoon();
}

/* ─────────── Notifications ─────────── */

export async function notify(
  userId: string,
  n: { kind: string; title: string; body?: string | null; link?: string | null },
) {
  const { error } = await db.from("notifications").insert({ user_id: userId, ...n });
  if (!error) void kickPushSoon();
}

export async function listNotifications(userId: string, limit = 50): Promise<NotificationRow[]> {
  const { data } = await db
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as NotificationRow[]) ?? [];
}

/** يرمي عند الفشل كي لا تُعلَّم مقروءة في الواجهة وهي غير مقروءة (تحليل «المزيد» BUG-05). */
export async function markNotificationRead(id: string) {
  const { error } = await db.from("notifications").update({ read: true }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await db
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
}
