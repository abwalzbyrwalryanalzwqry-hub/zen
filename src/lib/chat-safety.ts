/**
 * سلامة المحادثات (المرحلة 1 من docs/CHAT_AI_ROADMAP.md):
 * سياق المحادثة، واطلاع معلّم الحلقة، والإبلاغ، والحظر، وإعداد المركز، وضغط الصور.
 */
import { supabase } from "@/integrations/supabase/client";

export type ChatContext = {
  participant: boolean;
  /** معلّم حلقة الطالبين يطّلع على المحادثة (قراءة فقط). */
  supervisor: boolean;
  can_post: boolean;
  /** طرفاها طالبان في حلقة واحدة، فمعلّم الحلقة يطّلع عليها. */
  student_pair: boolean;
  peer_id: string | null;
  blocked_by_me: boolean;
  /** وصف الطرف الآخر (المرحلة 3). */
  peer_kind?: "teacher" | "guardian" | "student" | null;
  peer_avatar?: string | null;
  members: { id: string; name: string }[] | null;
};

export async function getChatContext(chatId: string): Promise<ChatContext | null> {
  const { data, error } = await supabase.rpc("chat_context", { _chat_id: chatId });
  if (error) return null;
  return data as unknown as ChatContext;
}

export async function setUserBlock(userId: string, blocked: boolean) {
  const { error } = await supabase.rpc("set_user_block", { _user: userId, _blocked: blocked });
  if (error) throw error;
}

export async function reportMessage(messageId: string, reason?: string) {
  const { error } = await supabase.rpc("report_message", {
    _id: messageId,
    _reason: reason ?? "",
  });
  if (error) throw error;
}

export type SupervisedChat = {
  chat_id: string;
  names: string;
  last_message: string | null;
  updated_at: string;
};

export async function listSupervisedChats(): Promise<SupervisedChat[]> {
  const { data, error } = await supabase.rpc("supervised_chats");
  if (error) return [];
  return (data as unknown as SupervisedChat[]) ?? [];
}

export type MessageReport = {
  id: string;
  chat_id: string;
  message_id: string;
  content: string;
  type: string;
  sender_name: string;
  reporter_name: string;
  reason: string | null;
  created_at: string;
  can_open: boolean;
};

export async function listOpenMessageReports(): Promise<MessageReport[]> {
  const { data, error } = await supabase.rpc("open_message_reports");
  if (error) return [];
  return (data as unknown as MessageReport[]) ?? [];
}

export async function resolveMessageReport(id: string) {
  const { error } = await supabase.rpc("resolve_message_report", { _report: id });
  if (error) throw error;
}

export async function setCenterStudentDm(centerId: string, enabled: boolean) {
  const { error } = await supabase.rpc("set_center_chat_settings", {
    _center: centerId,
    _student_dm_enabled: enabled,
  });
  if (error) throw error;
}

export async function getCenterStudentDm(centerId: string): Promise<boolean> {
  const { data } = await supabase
    .from("centers")
    .select("student_dm_enabled")
    .eq("id", centerId)
    .maybeSingle();
  return data?.student_dm_enabled === true;
}

/**
 * نسخة العميل من has_contact_info() في قاعدة البيانات: روابط أو 8 أرقام متتالية فأكثر
 * (بعد توحيد الأرقام العربية وحذف الفواصل). الخادم هو الحكم؛ هذه للتنبيه قبل الإرسال فقط.
 */
export function hasContactInfo(text: string): boolean {
  if (
    /(https?:\/\/|www\.|t\.me\/|wa\.me\/|chat\.whatsapp|[a-z0-9._-]+\.(com|net|org|me|io|app)\b)/i.test(
      text,
    )
  )
    return true;
  const digits = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s\-.()+]/g, "");
  return /[0-9]{8,}/.test(digits);
}

/** رسالة عربية واضحة لأخطاء الإرسال المعروفة. */
export function chatSendErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (msg.includes("CONTACT_INFO_BLOCKED") || msg.includes("contact info"))
    return "لا يُسمح بإرسال أرقام الهواتف أو الروابط بين الطلاب.";
  if (msg.includes("row-level security") || msg.includes("NOT_ALLOWED"))
    return "لم يعد بإمكانك الإرسال في هذه المحادثة.";
  return "تعذّر إرسال الرسالة. تحقّق من الاتصال ثم أعد المحاولة.";
}

/** الحد الأقصى لأطول ضلع في الصورة المرسلة. */
export const IMAGE_MAX_SIDE = 1600;

/** أبعاد الصورة بعد التصغير مع الحفاظ على النسبة. */
export function fitWithin(w: number, h: number, max = IMAGE_MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/**
 * يصغّر الصورة ويعيد ترميزها JPEG. إعادة الرسم على لوحة تحذف بيانات EXIF (ومنها الموقع الجغرافي).
 * الصور المتحركة (GIF) تبقى كما هي. عند تعذّر المعالجة تُرفض الصورة بدل إرسالها ببياناتها.
 */
export async function prepareChatImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    throw new Error("تعذّر تجهيز الصورة على هذا الجهاز.");
  }
  const bmp = await createImageBitmap(file);
  const { width, height } = fitWithin(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذّر تجهيز الصورة على هذا الجهاز.");
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
  if (!blob) throw new Error("تعذّر تجهيز الصورة على هذا الجهاز.");
  return blob;
}
