import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/integrations/supabase/rpc";
import { ApiError, unwrap, type ApiErrorLike } from "@/lib/api-error";
import { PROFILE_COLUMNS, type Profile } from "./zen-api-base";
import { AR_LATN } from "@/lib/i18n";
export type { Profile } from "./zen-api-base";
export * from "./zen-halaqat-api";
export * from "./zen-mushaf-api";

export { ApiError, unwrap };

/**
 * عميل بأنواع مرنة للجداول التي لم تُولَّد أنواعها بعد في types.ts
 * (progress, user_roles, centers, halaqat, mushaf_records, profile_contacts …).
 * نقطة واحدة فقط بدل تشتيت التحويلات في كل استدعاء.
 */
const db = supabase;

export type ChatRow = {
  id: string;
  participants: string[];
  is_group: boolean;
  title: string | null;
  last_message: string | null;
  last_sender: string | null;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  type: "text" | "image" | "voice" | "ai";
  content: string;
  status: "sent" | "delivered" | "seen";
  created_at: string;
  edited_at?: string | null;
  client_id?: string | null;
  reply_to?: string | null;
  deleted_at?: string | null;
};

export type ProgressRow = {
  id: string;
  user_id: string;
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
  memorization_type: "new" | "revision";
  rating: number | null;
  feedback: string | null;
  notes: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
};

/** عدد سجلات الحفظ المعروضة في القائمة؛ الإجماليات من `getProgressStats` على الخادم لا من هذه القائمة. */
export const PROGRESS_PAGE = 200;

export async function listProgress(userId: string): Promise<ProgressRow[]> {
  const res = await db
    .from("progress")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(PROGRESS_PAGE);
  return unwrap(res as { data: ProgressRow[] | null; error: ApiErrorLike | null }, []);
}

export type ProgressStats = {
  total: number;
  ayat: number;
  days: number;
  news: number;
  revs: number;
};

/** إجماليات كل سجل الحفظ (تدقيق 1.2)، بصلاحيات المستدعي (RLS) و«الأيام» بتوقيته. */
export async function getProgressStats(userId: string): Promise<ProgressStats> {
  const res = await rpc("progress_stats", { _user: userId });
  const raw = unwrap(res as { data: unknown; error: ApiErrorLike | null }, {}) as Partial<
    Record<keyof ProgressStats, number | string>
  >;
  const n = (v: unknown) => Number(v ?? 0) || 0;
  return {
    total: n(raw.total),
    ayat: n(raw.ayat),
    days: n(raw.days),
    news: n(raw.news),
    revs: n(raw.revs),
  };
}

export async function addProgress(input: {
  user_id: string;
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
  memorization_type: "new" | "revision";
  notes?: string | null;
}) {
  const { error } = await db.from("progress").insert(input);
  if (error) throw error;
}

/** تعديل الطالب تسجيله ما لم يُقيَّم (الحارس progress_guard يمنع غير ذلك). */
export async function updateProgress(
  id: string,
  patch: {
    surah_name: string;
    from_ayah: number;
    to_ayah: number;
    memorization_type: "new" | "revision";
    notes: string | null;
  },
) {
  const { data, error } = await db.from("progress").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not_found");
}

export async function deleteProgress(id: string) {
  const { data, error } = await db.from("progress").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not_found");
}

export async function reviewProgress(
  id: string,
  rating: number,
  feedback: string,
  reviewerId: string,
) {
  const { error } = await db
    .from("progress")
    .update({ rating, feedback, reviewed_by: reviewerId })
    .eq("id", id);
  if (error) throw error;
}

export async function listStudents(): Promise<Profile[]> {
  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("role", "student")
    .order("name");
  return (data as Profile[]) ?? [];
}

/**
 * طلاب حلقات المعلّم الحالي فقط. قاعدة البيانات لا تسمح له بقراءة تسميعات غيرهم أو تقدّمهم أو حضورهم أصلاً.
 */
export async function listMyStudents(): Promise<Profile[]> {
  const { data: rows, error } = await db.rpc("my_halaqa_student_ids");
  if (error) throw new Error("تعذّر تحميل طلاب حلقاتك.");
  const ids = ((rows as (string | { my_halaqa_student_ids: string })[]) ?? []).map((v) =>
    typeof v === "string" ? v : v.my_halaqa_student_ids,
  );
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("id", ids)
    .order("name");
  return (data as Profile[]) ?? [];
}

/** الملف الشخصي، أو null إن لم يوجد أو لا يحق للمستدعي رؤيته. يرمي `ApiError` عند خطأ الخادم/الشبكة. */
export async function getProfile(id: string): Promise<Profile | null> {
  const res = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
  return unwrap(res as { data: Profile | null; error: ApiErrorLike | null }, null);
}

/** أرقام هواتف مجموعة مستخدمين — تُرجع فقط ما تسمح به سياسة profile_contacts. */
export async function getVisiblePhones(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const { data } = await db
    .from("profile_contacts")
    .select("user_id, phone")
    .in("user_id", userIds);
  const map: Record<string, string> = {};
  ((data as { user_id: string; phone: string | null }[]) ?? []).forEach((r) => {
    if (r.phone) map[r.user_id] = r.phone;
  });
  return map;
}

/** Authoritative teacher check — reads the secure roles table, not the editable profile. */
export async function isTeacher(userId: string): Promise<boolean> {
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "teacher")
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function listProfiles(excludeId?: string): Promise<Profile[]> {
  let q = supabase.from("profiles").select(PROFILE_COLUMNS).order("name");
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  return (data as Profile[]) ?? [];
}

/**
 * من يحقّ للمستخدم بدء محادثة معهم: معلّم ↔ طلاب حلقاته، ومعلّم ↔ معلّم، وزملاء الحلقة الواحدة.
 * قاعدة البيانات ترفض أي محادثة جديدة خارج ذلك (can_start_chat).
 */
export async function listChatContacts(): Promise<Profile[]> {
  const { data: rows, error } = await db.rpc("my_chat_contacts");
  if (error) throw new Error("تعذّر تحميل جهات الاتصال.");
  const ids = ((rows as (string | { my_chat_contacts: string })[]) ?? []).map((v) =>
    typeof v === "string" ? v : v.my_chat_contacts,
  );
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("id", ids)
    .order("name");
  return (data as Profile[]) ?? [];
}

export async function listChats(userId: string): Promise<ChatRow[]> {
  const { data } = await supabase
    .from("chats")
    .select("*")
    .contains("participants", [userId])
    .order("updated_at", { ascending: false });
  return (data as ChatRow[]) ?? [];
}

/**
 * يفتح المحادثة الثنائية مع الطرف الآخر أو ينشئها (مرة واحدة لكل زوج، يضمنها فهرس فريد في
 * قاعدة البيانات). المحادثة القائمة تُفتح دائماً للقراءة حتى لو انتهت العلاقة.
 * المعامل الأول باقٍ للتوافق؛ الخادم يأخذ المستخدم من الجلسة.
 */
export async function getOrCreateDirectChat(_me: string, peer: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_or_create_direct_chat", { _peer: peer });
  if (error) throw error;
  return data as string;
}

/** حجم الصفحة الواحدة من الرسائل. */
export const MESSAGES_PAGE = 50;

/**
 * أحدث رسائل المحادثة (أو ما قبل `before`) بترتيب زمني تصاعدي.
 * يُجلب تنازلياً ثم يُعكس، حتى تظهر آخر الرسائل لا أولها في المحادثات الطويلة.
 */
export async function listMessages(
  chatId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<MessageRow[]> {
  let q = supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? MESSAGES_PAGE);
  if (opts.before) q = q.lt("created_at", opts.before);
  const { data, error } = await q;
  if (error) throw error;
  return ((data as MessageRow[]) ?? []).reverse();
}

/** هل يحق لي الإرسال في هذه المحادثة الآن؟ (تنتهي بانتهاء العلاقة، وتبقى الرسائل للقراءة.) */
export async function canPostInChat(chatId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_post_in_chat", {
    _chat_id: chatId,
    _uid: userId,
  });
  if (error) return true; // لا نحجب الإدخال بسبب خطأ شبكة؛ الخادم يرفض على أي حال.
  return data === true;
}

/**
 * إرسال رسالة نصية. رسائل «المساعد» لا تُدرج من العميل (يرفضها الخادم).
 * `clientId` يمنع التكرار عند إعادة المحاولة: إدراجه مرتين يرفضه فهرس فريد، فنعدّها نجاحاً.
 */
export async function sendMessage(
  chatId: string,
  senderId: string,
  content: string,
  clientId?: string,
  replyTo?: string | null,
) {
  const { error } = await supabase.from("messages").insert({
    chat_id: chatId,
    sender_id: senderId,
    content,
    type: "text",
    ...(clientId ? { client_id: clientId } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
  });
  if (error && !(clientId && error.code === "23505")) throw error;
}

export type InboxRow = ChatRow & {
  peer: Profile | null;
  unread: number;
  muted: boolean;
};

/** صندوق الوارد كاملاً في استدعاء واحد (my_inbox). */
export async function myInbox(): Promise<InboxRow[]> {
  const { data, error } = await supabase.rpc("my_inbox");
  if (error) throw error;
  return (data as unknown as InboxRow[]) ?? [];
}

/** كتم إشعارات محادثة لعدد ساعات (0 يرفع الكتم). */
export async function setChatMute(chatId: string, hours: number) {
  const { error } = await supabase.rpc("set_chat_mute", { _chat_id: chatId, _hours: hours });
  if (error) throw error;
}

/** حذف رسالتي للجميع (يبقى أثر «رسالة محذوفة»). */
export async function deleteMessage(id: string) {
  const { error } = await supabase.rpc("delete_message", { _id: id });
  if (error) throw error;
}

export const REACTIONS = ["👍", "❤️", "🤲", "✅", "🌟"] as const;
export type Reaction = { message_id: string; user_id: string; emoji: string };

export async function toggleReaction(id: string, emoji: string) {
  const { error } = await supabase.rpc("toggle_reaction", { _id: id, _emoji: emoji });
  if (error) throw error;
}

export async function listReactions(messageIds: string[]): Promise<Reaction[]> {
  if (messageIds.length === 0) return [];
  const { data } = await supabase
    .from("message_reactions")
    .select("message_id, user_id, emoji")
    .in("message_id", messageIds);
  return (data as Reaction[]) ?? [];
}

/** تعديل نص رسالتي خلال 15 دقيقة من إرسالها. */
export async function editMessage(id: string, content: string) {
  const { error } = await supabase.rpc("edit_message", { _id: id, _content: content });
  if (error) throw error;
}

export function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "الآن";
  if (diff < 3600) return `${Math.floor(diff / 60)} د`;
  if (diff < 86400) return d.toLocaleTimeString(AR_LATN, { hour: "2-digit", minute: "2-digit" });
  if (diff < 86400 * 7) return d.toLocaleDateString(AR_LATN, { weekday: "long" });
  return d.toLocaleDateString(AR_LATN);
}

export function initialOf(name: string) {
  return name?.trim()?.[0] ?? "?";
}

const palette = [
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-yellow-600",
  "from-rose-400 to-pink-500",
  "from-indigo-400 to-violet-500",
  "from-cyan-500 to-sky-600",
  "from-fuchsia-500 to-purple-600",
];
export function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/* ─────────── Message search ─────────── */

export type MessageHit = MessageRow & { chat_title?: string };

/**
 * بحث عربي داخل محادثاتي فقط، مطبَّع على الخادم: بلا تشكيل ومع توحيد الألف والياء والتاء المربوطة
 * (search_my_messages).
 */
export async function searchMessages(term: string, limit = 30): Promise<MessageRow[]> {
  const t = term.trim();
  if (t.length < 2) return [];
  const { data } = await supabase.rpc("search_my_messages", { _q: t, _limit: limit });
  return (data as MessageRow[]) ?? [];
}
