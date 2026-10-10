import { supabase } from "@/integrations/supabase/client";
import type { MessageRow } from "@/lib/zen-api";

/**
 * حالة القراءة ومرفقات المحادثات.
 *
 * الجداول والدوال هنا أُضيفت في ترحيلات 20260922 ولم تُولَّد أنواعها في
 * src/integrations/supabase/types.ts (وهو ملف مُولَّد لا يُحرَّر يدوياً)،
 * لذلك تُستخدم نقطة تحويل واحدة بدل تشتيت التحويلات.
 */
const db = supabase;

export const CHAT_MEDIA_BUCKET = "chat-media";

/** أقصى حجم مرفق مقبول (الحاوية ترفض أكبر منه على الخادم أيضاً). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** أقصى مدة رسالة صوتية بالثواني. */
export const MAX_VOICE_SECONDS = 180;

/** تعليم كل رسائل الطرف الآخر في المحادثة كمقروءة. يعيد عدد الرسائل المتأثرة. */
export async function markChatSeen(chatId: string): Promise<number> {
  const { data, error } = await db.rpc("mark_chat_seen", { _chat_id: chatId });
  if (error) throw error;
  return (data as number | null) ?? 0;
}

/** عدد غير المقروء لكل محادثة: { [chatId]: count }. */
export async function unreadCounts(): Promise<Record<string, number>> {
  const { data, error } = await db.rpc("unread_counts");
  if (error) throw error;
  const rows = (data as { chat_id: string; unread: number }[] | null) ?? [];
  const map: Record<string, number> = {};
  for (const r of rows) map[r.chat_id] = r.unread;
  return map;
}

/** إجمالي غير المقروء في كل المحادثات (لشارة التنقّل). */
export async function unreadTotal(): Promise<number> {
  const { data, error } = await db.rpc("unread_total");
  if (error) throw error;
  return (data as number | null) ?? 0;
}

const EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** امتداد الملف لنوع مدعوم، أو undefined. */
export const mediaExt = (mime: string): string | undefined => EXT_BY_MIME[mime];

/** رفع إلى مسار محدد (صندوق الوسائط M9: المسار ثابت من client_id). */
export async function uploadChatMediaAt(path: string, file: Blob): Promise<void> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("حجم المرفق أكبر من 10 ميغابايت.");
  const { error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw error;
}

/**
 * رفع مرفق إلى حاوية المحادثات.
 * المسار {chat_id}/{sender_id}/… مطلوب: سياسات التخزين تتحقق منه.
 */
export async function uploadChatMedia(
  chatId: string,
  senderId: string,
  file: Blob,
): Promise<string> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("حجم المرفق أكبر من 10 ميغابايت.");
  }
  const mime = file.type || "application/octet-stream";
  const ext = EXT_BY_MIME[mime];
  if (!ext) {
    throw new Error("نوع الملف غير مدعوم. المسموح: صور أو تسجيل صوتي.");
  }
  const path = `${chatId}/${senderId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(path, file, { contentType: mime, upsert: false });
  if (error) throw error;
  return path;
}

/** رابط موقّت للمرفق (الحاوية خاصة، فلا روابط عامة). */
export async function chatMediaUrl(path: string, seconds = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(CHAT_MEDIA_BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

/** إرسال رسالة مرفق (صورة أو صوت) بعد رفع الملف. */
export async function sendMediaMessage(input: {
  chatId: string;
  senderId: string;
  kind: "image" | "voice";
  mediaPath: string;
  durationSeconds?: number | null;
  /** معرّف العميل (M9): يمنع تكرار الرسالة عند إعادة الإرسال. */
  clientId?: string;
}): Promise<void> {
  const { error } = await db.from("messages").insert({
    chat_id: input.chatId,
    sender_id: input.senderId,
    type: input.kind,
    content: input.kind === "voice" ? "رسالة صوتية" : "صورة",
    media_path: input.mediaPath,
    duration_seconds: input.kind === "voice" ? (input.durationSeconds ?? null) : null,
    ...(input.clientId ? { client_id: input.clientId } : {}),
  });
  if (error && !(input.clientId && error.code === "23505")) throw error;
}

/** صف الرسالة بعد إضافة أعمدة المرفقات. */
export type MessageWithMedia = MessageRow & {
  media_path?: string | null;
  duration_seconds?: number | null;
};

/** تنسيق مدة بالثواني إلى m:ss. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
