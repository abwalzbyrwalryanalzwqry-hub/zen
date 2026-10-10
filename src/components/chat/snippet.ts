import type { MessageWithMedia } from "@/lib/chat-extras";

/** نص مختصر لرسالة في «رد على» و«تعديل». */
export const snippet = (m: MessageWithMedia | undefined) =>
  !m
    ? "رسالة"
    : m.deleted_at
      ? "رسالة محذوفة"
      : m.type === "image"
        ? "📷 صورة"
        : m.type === "voice"
          ? "🎤 رسالة صوتية"
          : m.content.slice(0, 80);
