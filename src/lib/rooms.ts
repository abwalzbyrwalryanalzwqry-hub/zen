/**
 * غرف الحلقة (المرحلة 13): قناة الإعلانات ومجموعة النقاش.
 *
 * كل الكتابة عبر دوال قاعدة البيانات (post_room_message وأخواتها)، والصلاحيات
 * تُحسم في room_role على الخادم. الدوال البحتة هنا للعرض والتحقق المسبق فقط،
 * ولا تُغني عن فحص الخادم.
 */
import { supabase } from "@/integrations/supabase/client";
import { stripMentions, type MentionCandidate } from "@/lib/mentions";
import { rpc, type RpcName } from "@/integrations/supabase/rpc";

export type RoomKind = "announcements" | "discussion";
export type RoomRole = "mod" | "member" | "reader";

export type RoomSummary = {
  room_id: string;
  halaqa_id: string;
  halaqa_name: string;
  kind: RoomKind;
  enabled: boolean;
  role: RoomRole;
  can_post: boolean;
  last_message: string | null;
  last_at: string | null;
  unread: number;
};

export type RoomMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_is_mod: boolean;
  content: string | null;
  deleted: boolean;
  /** أُخفيت تلقائياً بعد 3 بلاغات حتى يراجعها المشرف (المرحلة 3). */
  hidden?: boolean;
  pinned: boolean;
  created_at: string;
  mine: boolean;
  reported_by_me: boolean;
  /** 9.7: رسالة صوتية (المسار لمن يحق له سماعها فقط). */
  kind?: "text" | "voice";
  media_path?: string | null;
  duration_seconds?: number | null;
};

export type RoomInfo = {
  room_id: string;
  halaqa_id: string;
  halaqa_name: string;
  kind: RoomKind;
  enabled: boolean;
  role: RoomRole;
  can_post: boolean;
  muted_until: string | null;
  open_reports: number;
  pinned: { id: string; content: string; created_at: string; sender_name: string } | null;
};

export type OpenReport = {
  message_id: string;
  sender_id: string;
  sender_name: string;
  content: string | null;
  created_at: string;
  reports: number;
  reasons: string[];
};

export type DiscussionMember = {
  student_id: string;
  name: string;
  has_guardian: boolean;
  consented: boolean;
  muted_until: string | null;
};

export type DiscussionSettings = {
  room_id: string | null;
  enabled: boolean;
  consent_required: boolean;
  members: DiscussionMember[];
};

export type GuardianConsent = {
  halaqa_id: string;
  halaqa_name: string;
  student_id: string;
  student_name: string;
  consented: boolean;
};

export const MAX_ROOM_MESSAGE = 2000;
export const MUTE_OPTIONS = [
  { hours: 1, label: "ساعة" },
  { hours: 24, label: "يوم" },
  { hours: 168, label: "أسبوع" },
] as const;

/** يتحقق من نص الرسالة قبل الإرسال؛ يعيد رسالة خطأ أو null. */
export function validateRoomMessage(text: string): string | null {
  const t = text.trim();
  if (!t) return "اكتب رسالة أولاً.";
  if (t.length > MAX_ROOM_MESSAGE) return `الرسالة أطول من ${MAX_ROOM_MESSAGE} حرف.`;
  return null;
}

export function roomTitle(r: { kind: RoomKind; halaqa_name: string }): string {
  return r.kind === "announcements" ? `إعلانات ${r.halaqa_name}` : `نقاش ${r.halaqa_name}`;
}

/** ما يُتاح للمستخدم على رسالة معيّنة. */
export function messageActions(m: RoomMessage, role: RoomRole) {
  const isMod = role === "mod";
  if (m.deleted) return { report: false, delete: false, pin: false, mute: false };
  return {
    report: !m.mine && !m.reported_by_me,
    delete: m.mine || isMod,
    pin: isMod,
    mute: isMod && !m.mine && !m.sender_is_mod,
  };
}

/** يرتّب الغرف: غير المقروء أولاً ثم الأحدث نشاطاً. */
export function sortRooms(rooms: RoomSummary[]): RoomSummary[] {
  return [...rooms].sort((a, b) => {
    if ((b.unread > 0 ? 1 : 0) !== (a.unread > 0 ? 1 : 0)) return b.unread > 0 ? 1 : -1;
    const ta = a.last_at ? Date.parse(a.last_at) : 0;
    const tb = b.last_at ? Date.parse(b.last_at) : 0;
    if (tb !== ta) return tb - ta;
    return roomTitle(a).localeCompare(roomTitle(b), "ar");
  });
}

/** يترجم أخطاء الخادم المعروفة إلى رسائل عربية. */
export function roomErrorMessage(err: unknown): string {
  const msg =
    err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
  if (msg.includes("muted")) return "أوقف المعلّم مشاركتك مؤقتاً.";
  if (msg.includes("rate limit")) return "أرسلت رسائل كثيرة. انتظر دقيقة.";
  if (msg.includes("announcements are for teachers")) return "الإعلانات للمعلّم وحده.";
  if (msg.includes("message length")) return "طول الرسالة غير مقبول.";
  if (msg.includes("contact info")) return "لا يُسمح بنشر أرقام الهواتف أو الروابط في النقاش.";
  if (msg.includes("cannot mute a moderator")) return "لا يمكن إيقاف مشرف.";
  if (msg.includes("cannot report own")) return "لا يمكنك الإبلاغ عن رسالتك.";
  if (msg.includes("not a member")) return "الطالب ليس عضواً في الحلقة.";
  if (msg.includes("VOICE_NOT_ALLOWED"))
    return "الرسائل الصوتية تحتاج موافقة وليّ أمرك على المشاركة في النقاش.";
  if (msg.includes("VOICE_LENGTH")) return "الرسالة الصوتية حتى 60 ثانية.";
  if (msg.includes("INVALID_TIME")) return "اختر وقتاً بعد دقيقتين على الأقل وخلال 30 يوماً.";
  if (msg.includes("TOO_MANY_SCHEDULED")) return "في الغرفة 20 رسالة مجدولة. ألغِ بعضها أولاً.";
  if (msg.includes("NOT_ROOM_MOD")) return "الجدولة لمشرف الغرفة وحده.";
  return "تعذّر إتمام العملية.";
}

// الاسم مُتحقَّق منه وقت الترجمة؛ الوسائط تُبنى في الدوال المصدَّرة أدناه.
async function call<T>(fn: RpcName, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

// المعاينات تعرض «@الاسم» لا صيغة الإشارة المخزّنة (9.6).
export const myRooms = () =>
  call<RoomSummary[]>("my_rooms").then((r) =>
    (r ?? []).map((x) =>
      x.last_message ? { ...x, last_message: stripMentions(x.last_message) } : x,
    ),
  );
export const roomInfo = (roomId: string) =>
  call<RoomInfo>("room_info", { _room: roomId }).then((i) =>
    i?.pinned ? { ...i, pinned: { ...i.pinned, content: stripMentions(i.pinned.content) } } : i,
  );
export const mentionCandidates = (roomId: string) =>
  call<MentionCandidate[]>("room_mention_candidates", { _room: roomId }).then((r) => r ?? []);
export const roomMessages = (roomId: string, before?: string) =>
  call<RoomMessage[]>("room_messages_page", {
    _room: roomId,
    _before: before ?? null,
    _limit: 50,
  }).then((r) => r ?? []);
export const postRoomMessage = (roomId: string, content: string) =>
  call<string>("post_room_message", { _room: roomId, _content: content.trim() });
export const deleteRoomMessage = (id: string) => call<void>("delete_room_message", { _id: id });
export const pinRoomMessage = (id: string, pinned: boolean) =>
  call<void>("pin_room_message", { _id: id, _pinned: pinned });
export const markRoomRead = (roomId: string) => call<void>("mark_room_read", { _room: roomId });
export const muteRoomMember = (roomId: string, userId: string, hours: number) =>
  call<void>("mute_room_member", { _room: roomId, _user: userId, _hours: hours });
export const reportRoomMessage = (id: string, reason?: string) =>
  call<void>("report_room_message", { _id: id, _reason: reason ?? null });
export const openReports = (roomId: string) =>
  call<OpenReport[]>("room_open_reports", { _room: roomId }).then((r) => r ?? []);
export const resolveReports = (messageId: string, del: boolean) =>
  call<void>("resolve_room_reports", { _message: messageId, _delete: del });
export const setDiscussion = (halaqaId: string, enabled: boolean, consentRequired: boolean) =>
  call<string>("set_discussion", {
    _halaqa: halaqaId,
    _enabled: enabled,
    _consent_required: consentRequired,
  });
export const discussionSettings = (halaqaId: string) =>
  call<DiscussionSettings>("discussion_settings", { _halaqa: halaqaId });
export const setRoomConsent = (halaqaId: string, studentId: string, allow: boolean) =>
  call<void>("set_room_consent", { _halaqa: halaqaId, _student: studentId, _allow: allow });
export const guardianRoomConsents = () =>
  call<GuardianConsent[]>("guardian_room_consents").then((r) => r ?? []);

/** «قرأه X من Y» لرسائل الغرفة (للمشرف فقط). */
export type RoomReadStats = { total: number; messages: Record<string, number> };
export const roomReadStats = (roomId: string) =>
  call<RoomReadStats>("room_read_stats", { _room: roomId });

/* ─── الرسائل المجدولة (9.5) ─── */
export interface ScheduledRoomMessage {
  id: string;
  content: string;
  scheduled_at: string;
  status: "pending" | "sent" | "cancelled" | "failed";
  error: string | null;
}
export const scheduleRoomMessage = (roomId: string, content: string, at: Date) =>
  call<string>("schedule_room_message", {
    _room: roomId,
    _content: content.trim(),
    _at: at.toISOString(),
  });
export const cancelScheduledRoomMessage = (id: string) =>
  call<boolean>("cancel_scheduled_room_message", { _id: id });
export const scheduledRoomMessages = (roomId: string) =>
  call<ScheduledRoomMessage[]>("room_scheduled_list", { _room: roomId }).then((r) => r ?? []);

/** قيمة datetime-local الافتراضية: بعد ساعة، مقرّبة إلى ربع الساعة، بتوقيت الجهاز. */
export function defaultScheduleValue(now = new Date()): string {
  const d = new Date(now.getTime() + 60 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** يتحقّق من وقت الجدولة (نافذة الخادم نفسها: بعد دقيقتين وخلال 30 يوماً). */
export function scheduleTimeError(value: string, now = Date.now()): string | null {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return "اختر التاريخ والوقت.";
  if (t < now + 2 * 60_000) return "اختر وقتاً بعد دقيقتين على الأقل.";
  if (t > now + 30 * 86_400_000) return "الجدولة خلال 30 يوماً فقط.";
  return null;
}

/* ─── الرسائل الصوتية (9.7) ─── */
export const ROOM_MEDIA_BUCKET = "room-media";
export const MAX_ROOM_VOICE_SECONDS = 60;

export const myRoomVoiceAllowed = (roomId: string) =>
  call<boolean>("my_room_voice_allowed", { _room: roomId }).then(Boolean);

/** المسار {room}/{sender}/{عشوائي}.ext — تفرضه سياسة التخزين. */
export function roomVoicePath(
  roomId: string,
  userId: string,
  mime: string,
  id: string = crypto.randomUUID(),
) {
  const ext =
    mime.includes("mp4") || mime.includes("aac") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
  return `${roomId}/${userId}/${id}.${ext}`;
}

export async function sendRoomVoice(roomId: string, userId: string, blob: Blob, seconds: number) {
  const s = Math.round(seconds);
  if (s < 1 || s > MAX_ROOM_VOICE_SECONDS) throw new Error("VOICE_LENGTH");
  const type = (blob.type || "audio/webm").split(";")[0];
  const path = roomVoicePath(roomId, userId, type);
  const { error } = await supabase.storage
    .from(ROOM_MEDIA_BUCKET)
    .upload(path, blob, { contentType: type });
  if (error)
    throw new Error(error.message.includes("row-level") ? "VOICE_NOT_ALLOWED" : error.message);
  return call<string>("post_room_voice", { _room: roomId, _path: path, _seconds: s });
}

export async function roomVoiceUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(ROOM_MEDIA_BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw new Error("تعذّر تشغيل الرسالة الصوتية.");
  return data.signedUrl;
}
