// المراكز والحلقات وأعضاؤها ودعواتها (M5: من zen-api.ts دون تغيير السلوك؛ يُعاد تصديرها منه).

import { supabase } from "@/integrations/supabase/client";
import { PROFILE_COLUMNS, type Profile } from "./zen-api-base";

const db = supabase;

/* ─────────── Centers / Halaqat / Members ─────────── */

export type Center = {
  id: string;
  name: string;
  city: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
};

export type Halaqa = {
  id: string;
  center_id: string;
  name: string;
  teacher_id: string | null;
  schedule: string | null;
  created_at: string;
};

export async function listCenters(): Promise<Center[]> {
  const { data } = await db.from("centers").select("*").order("created_at", { ascending: false });
  return (data as Center[]) ?? [];
}

export async function addCenter(input: {
  name: string;
  city?: string | null;
  description?: string | null;
  created_by: string;
}) {
  const { error } = await db.from("centers").insert(input);
  if (error) throw error;
}

export async function listHalaqat(centerId?: string): Promise<Halaqa[]> {
  let q = db.from("halaqat").select("*").order("created_at", { ascending: false });
  if (centerId) q = q.eq("center_id", centerId);
  const { data } = await q;
  return (data as Halaqa[]) ?? [];
}

export async function addHalaqa(input: {
  center_id: string;
  name: string;
  teacher_id: string;
  schedule?: string | null;
}) {
  const { error } = await db.from("halaqat").insert(input);
  if (error) throw error;
}

export async function listHalaqaMembers(halaqaId: string): Promise<Profile[]> {
  const { data } = await db.from("halaqa_students").select("student_id").eq("halaqa_id", halaqaId);
  const ids = ((data as { student_id: string }[]) ?? []).map((r) => r.student_id);
  if (ids.length === 0) return [];
  const { data: profs } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("id", ids)
    .order("name");
  return (profs as Profile[]) ?? [];
}

/* ─────────── دعوات الحلقات (الانضمام بموافقة الطالب) ─────────── */

export type HalaqaInvite = {
  id: string;
  halaqa_id: string;
  student_id: string;
  invited_by: string;
  status: "pending" | "awaiting_guardian" | "accepted" | "declined" | "cancelled";
  created_at: string;
  responded_at: string | null;
};

/** دعوة تنتظر موافقة وليّ الأمر (11.1). */
export type GuardianPendingInvite = {
  id: string;
  student_id: string;
  student_name: string;
  halaqa_name: string;
  teacher_name: string;
  center_name: string | null;
  schedule: string | null;
  responded_at: string | null;
};

export type HalaqaInviteWithHalaqa = HalaqaInvite & { halaqa_name: string; inviter_name: string };

function inviteError(message: string | undefined): Error {
  const m = message ?? "";
  if (m.includes("ALREADY_MEMBER")) return new Error("الطالب عضو في هذه الحلقة من قبل.");
  if (m.includes("NOT_YOUR_HALAQA")) return new Error("لا يمكنك دعوة طلاب إلى حلقة لا تديرها.");
  if (m.includes("INVALID_STUDENT")) return new Error("هذا الطالب غير موجود.");
  if (m.includes("INVITE_CLOSED")) return new Error("انتهت هذه الدعوة من قبل.");
  if (m.includes("INVITE_NOT_FOUND")) return new Error("الدعوة غير موجودة.");
  return new Error("تعذّرت العملية. حاول مرة أخرى.");
}

/** يرسل مديرُ الحلقة دعوةً لطالب مسجّل. لا يصبح عضواً ولا يرى المعلّمُ بياناته قبل قبوله. */
export async function inviteStudentToHalaqa(halaqaId: string, studentId: string): Promise<string> {
  const { data, error } = await db.rpc("invite_to_halaqa", {
    _halaqa: halaqaId,
    _student: studentId,
  });
  if (error) throw inviteError(error.message);
  return data as string;
}

/** الدعوات المعلّقة لحلقة (لمديرها فقط — تفرضه قاعدة البيانات). */
export async function listPendingHalaqaInvites(halaqaId: string): Promise<HalaqaInvite[]> {
  const { data } = await db
    .from("halaqa_invites")
    .select("*")
    .eq("halaqa_id", halaqaId)
    .in("status", ["pending", "awaiting_guardian"])
    .order("created_at", { ascending: false });
  return (data as HalaqaInvite[]) ?? [];
}

export async function cancelHalaqaInvite(inviteId: string) {
  const { error } = await db.rpc("cancel_halaqa_invite", { _invite: inviteId });
  if (error) throw inviteError(error.message);
}

/** دعوات الطالب الحالي المعلّقة، مع اسم الحلقة ومن دعاه. */
export async function listMyHalaqaInvites(userId: string): Promise<HalaqaInviteWithHalaqa[]> {
  const { data } = await db
    .from("halaqa_invites")
    .select("*")
    .eq("student_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  const invites = (data as HalaqaInvite[]) ?? [];
  if (invites.length === 0) return [];
  const [{ data: halaqat }, { data: people }] = await Promise.all([
    db
      .from("halaqat")
      .select("id, name")
      .in("id", [...new Set(invites.map((i) => i.halaqa_id))]),
    supabase
      .from("profiles")
      .select("id, name")
      .in("id", [...new Set(invites.map((i) => i.invited_by))]),
  ]);
  const hName = new Map(
    ((halaqat as { id: string; name: string }[]) ?? []).map((h) => [h.id, h.name]),
  );
  const pName = new Map(
    ((people as { id: string; name: string }[]) ?? []).map((p) => [p.id, p.name]),
  );
  return invites.map((i) => ({
    ...i,
    halaqa_name: hName.get(i.halaqa_id) ?? "حلقة",
    inviter_name: pName.get(i.invited_by) ?? "معلّم",
  }));
}

/** يعيد accepted | declined | awaiting_guardian (الطالب المربوط بوليّ أمر ينتظر موافقته، 11.1). */
export async function respondHalaqaInvite(
  inviteId: string,
  accept: boolean,
): Promise<"accepted" | "declined" | "awaiting_guardian"> {
  const { data, error } = await db.rpc("respond_halaqa_invite", {
    _invite: inviteId,
    _accept: accept,
  });
  if (error) throw inviteError(error.message);
  return (
    (data as "accepted" | "declined" | "awaiting_guardian") ?? (accept ? "accepted" : "declined")
  );
}

export async function guardianPendingInvites(): Promise<GuardianPendingInvite[]> {
  const { data, error } = await db.rpc("guardian_pending_invites");
  if (error) throw error;
  return (data as unknown as GuardianPendingInvite[]) ?? [];
}

export async function guardianApproveInvite(inviteId: string, approve: boolean) {
  const { data, error } = await db.rpc("guardian_approve_invite", {
    _invite: inviteId,
    _approve: approve,
  });
  if (error) throw inviteError(error.message);
  return data as "accepted" | "declined";
}

export async function removeStudentFromHalaqa(halaqaId: string, studentId: string) {
  const { error } = await db
    .from("halaqa_students")
    .delete()
    .eq("halaqa_id", halaqaId)
    .eq("student_id", studentId);
  if (error) throw error;
}
