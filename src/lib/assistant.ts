/** رسالة في شاشة «مساعد زِن». `error` لرسائل الفشل التي لا تُعاد إلى النموذج. */
export type AssistantMessage = { from: "me" | "ai"; text: string; error?: boolean };

/** أقصى عدد رسائل تُرسل للمساعد (الخادم يرفض أكثر من 30). */
export const HISTORY_LIMIT = 20;

/**
 * السجل المرسل للمساعد: بلا رسالة الترحيب الأولى وبلا رسائل الخطأ، وآخر HISTORY_LIMIT رسالة
 * فقط، وكل رسالة ضمن حد الخادم (4000 حرف). بدونه كانت المحادثة تتعطل بعد نحو 15 سؤالاً.
 */
export function assistantHistory(all: AssistantMessage[]) {
  return all
    .slice(1)
    .filter((m) => !m.error)
    .slice(-HISTORY_LIMIT)
    .map((m) => ({
      role: (m.from === "me" ? "user" : "assistant") as "user" | "assistant",
      content: m.text.slice(0, 4000),
    }));
}
