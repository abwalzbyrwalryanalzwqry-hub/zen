/**
 * نواة مساعد زِن (المرحلة 4): التعليمات ومنطق المحادثة. ربط الآيات في `ai-refs-core.ts` والمزوّدون في
 * `ai-provider-core.ts` (M5)، ويُعاد تصديرهما من هنا فلا يتغيّر مسار الاستيراد. لا اعتماديات خارجية، والاستيراد
 * النسبي بلاحقة `.ts` لتعمل كما هي في Node وفي دالة Supabase Edge (Deno).
 * نسخها في `supabase/functions/_shared/` يجب أن تطابقها حرفياً (يتحقق اختبار من ذلك).
 *
 * القاعدة: المساعد لا يكتب نص القرآن بنفسه. يكتب المرجع [[البقرة:255]] ويعرض التطبيق النص من المصحف.
 */

export * from "./ai-refs-core.ts";
export * from "./ai-provider-core.ts";
import { groundAnswer, StreamGrounder } from "./ai-refs-core.ts";
import { AiError, type ChatMessage } from "./ai-provider-core.ts";

// ─── التعليمات ───
export type AiMode = "chat" | "summarize" | "learn" | "feedback";

const COMMON = `- أجب بالعربية الفصحى الواضحة، بأسلوب ودود ومحترم ومختصر.
- كثير من المستخدمين طلاب صغار: لا تطلب معلومات شخصية (رقم، عنوان، مدرسة، صور)، ولا تقترح التواصل خارج التطبيق،
  وإن ذكر المستخدم أذىً أو خطراً فانصحه بلطف بإخبار وليّ أمره أو معلّمه فوراً.
- لا تكتب نص أي آية بنفسك أبداً. إذا احتجت آية فاكتب مرجعها فقط بهذه الصيغة: [[اسم السورة:رقم الآية]]
  أو [[اسم السورة:من-إلى]] (عشر آيات على الأكثر)، مثل [[البقرة:255]]، وسيعرض التطبيق نصها من المصحف.
- لا تُصدر فتاوى قاطعة في المسائل الخلافية؛ اذكر أقوال أهل العلم إجمالاً وانصح بسؤال المعلّم أو أهل العلم.
- إن لم تعرف فقل ذلك، ولا تنسب حديثاً إلا مع درجته إن كنت متأكداً منها.`;

export const SYSTEM_PROMPTS: Record<AiMode, string> = {
  chat: `أنت «مساعد زِن»، مساعد تعليمي إسلامي داخل تطبيق زِن لتحفيظ القرآن.
${COMMON}
- حدّد بنفسك نوع الطلب: سؤال عام، أو شرح وتعلّم (قدّم خطوات عملية منظّمة)، أو خطة حفظ (قسّم الآيات وحدّد التكرار).
- استعمل التعداد النقطي والعناوين القصيرة عند الحاجة، ولا تتجاوز 12 سطراً إلا إذا طُلب التفصيل.
- إذا طُلب اقتراح رد، أعطِ رداً واحداً قابلاً للإرسال مباشرة.`,
  summarize: `أنت «مساعد زِن». لخّص المحادثة التالية بالعربية في نقاط قصيرة:
• الموضوع الرئيسي.
• أهم النقاط أو القرارات.
• الخطوة التالية المقترحة.
${COMMON}
اجعل الرد مختصراً (لا يتجاوز 6 أسطر).`,
  learn: `أنت «مساعد زِن» لمساعدة الحفظ والتعلّم.
${COMMON}
اشرح بأسلوب مبسّط وقدّم إرشاداً عملياً منظّماً (خطة تكرار، تقسيم الآيات، نصائح للحفظ).`,
  feedback: `أنت «مساعد زِن»، مقيّم حفظ القرآن.
${COMMON}
حلّل سجل الحفظ (السور، عدد الآيات، الجديد مقابل المراجعة، الملاحظات) وقدّم تقييماً موجزاً ونصيحتين عمليتين
واقتراح خطة اليوم أو الغد. كن مشجّعاً ومختصراً (4-7 أسطر).`,
};

export const DAILY_CHAT_LIMIT = 120;
export const MINUTE_LIMIT = 8;
export const HISTORY_LIMIT = 20;

// ─── منطق المحادثة المحفوظة ───
export type StoredMessage = { id: string; role: "user" | "assistant"; content: string };

/** ما يحتاجه المنطق من قاعدة البيانات؛ ينفّذه الخادم ودالة Edge كلٌّ بعميله. */
export interface AssistantStore {
  consumeQuota(
    userId: string,
    feature: string,
    daily: number,
    minute: number,
  ): Promise<{
    allowed: boolean;
    reason?: string | null;
    used_today?: number;
  }>;
  refundQuota(userId: string, feature: string): Promise<void>;
  createConversation(userId: string, title: string): Promise<string>;
  ownsConversation(userId: string, conversationId: string): Promise<boolean>;
  insertMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
  ): Promise<string>;
  history(conversationId: string, limit: number): Promise<StoredMessage[]>;
  deleteMessage(id: string): Promise<void>;
  /** ملخّص الحفظ بموافقة المستخدم (12.2)، أو null بلا موافقة. */
  memoContext?(userId: string): Promise<unknown | null>;
}

// ─── سياق الحفظ بموافقة (المرحلة 12.2) ───
type MemoQueueItem = {
  kind?: string;
  surah_name?: string;
  from_ayah?: number;
  to_ayah?: number;
  done?: boolean;
};
export type MemoContext = {
  queue?: { total_minutes?: number; items?: MemoQueueItem[] } | null;
  errors?: { surah_name?: string; from_ayah?: number; to_ayah?: number }[] | null;
  streak?: number | null;
  memorized_pages?: number | null;
};

const QUEUE_KIND: Record<string, string> = {
  assignment: "واجب",
  review: "مراجعة",
  exam_error: "تصحيح خطأ",
  wird: "الورد",
};
const range = (x: { surah_name?: string; from_ayah?: number; to_ayah?: number }) =>
  x.surah_name
    ? `${x.surah_name} ${x.from_ayah ?? ""}${x.to_ayah && x.to_ayah !== x.from_ayah ? "-" + x.to_ayah : ""}`.trim()
    : "";

/**
 * يحوّل ملخّص الخادم إلى سطور قصيرة تُضاف تعليماتٍ للنموذج. لا أسماء ولا درجات، ولا نص آيات (أسماء
 * السور وأرقام الآيات فقط)، وبحد أقصى 900 حرف.
 */
export function formatMemoContext(ctx: unknown): string | null {
  if (!ctx || typeof ctx !== "object") return null;
  const c = ctx as MemoContext;
  const lines: string[] = [];
  const open = (c.queue?.items ?? []).filter((i) => !i.done).slice(0, 6);
  if (open.length) {
    lines.push(
      `مهام اليوم (${c.queue?.total_minutes ?? 0} دقيقة تقريباً): ` +
        open
          .map((i) => [QUEUE_KIND[i.kind ?? ""] ?? i.kind, range(i)].filter(Boolean).join(" "))
          .join("، "),
    );
  }
  const errs = (c.errors ?? []).map(range).filter(Boolean).slice(0, 5);
  if (errs.length) lines.push(`آخر مواضع الخطأ في الاختبارات: ${errs.join("، ")}`);
  if (typeof c.memorized_pages === "number") lines.push(`صفحات محفوظة: ${c.memorized_pages}`);
  if (typeof c.streak === "number" && c.streak > 0) lines.push(`أيام التزام متتالية: ${c.streak}`);
  if (!lines.length) return null;
  const body = lines.join("\n").slice(0, 900);
  return `سياق حفظ المستخدم (بموافقته، استعمله لتخصيص النصيحة فقط ولا تكرّره حرفياً):\n${body}`;
}

async function contextMessages(
  store: AssistantStore,
  userId: string,
  history: StoredMessage[],
): Promise<ChatMessage[]> {
  let memo: string | null;
  try {
    memo = store.memoContext ? formatMemoContext(await store.memoContext(userId)) : null;
  } catch {
    memo = null; // تعذّر السياق لا يمنع الإجابة
  }
  return [
    { role: "system", content: SYSTEM_PROMPTS.chat },
    ...(memo ? [{ role: "system" as const, content: memo }] : []),
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
}

export type AskInput = {
  conversationId?: string | null;
  message?: string;
  /** يعيد توليد آخر ردّ بدل إضافة سؤال جديد. */
  regenerate?: boolean;
};
export type AskResult = {
  conversationId: string;
  messageId: string;
  text: string;
  remaining: number;
};

/** خطأ يخصّ طلب المستخدم نفسه، برسالة عربية تُعرض كما هي ورمز HTTP مناسب. */
export class AssistantUserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function quotaMessage(reason: string | null | undefined, daily: number): string {
  return reason === "minute"
    ? "طلبات كثيرة في وقت قصير. انتظر قليلاً ثم أعد المحاولة."
    : `بلغت حدّ الاستخدام اليومي للمساعد (${daily} سؤالاً). عد غداً.`;
}

export function titleFrom(message: string): string {
  const t = message.replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 57) + "…" : t || "محادثة جديدة";
}

export async function runAssistant(
  userId: string,
  input: AskInput,
  store: AssistantStore,
  complete: (messages: ChatMessage[]) => Promise<string>,
): Promise<AskResult> {
  const message = (input.message ?? "").trim();
  if (!input.regenerate && (message.length < 1 || message.length > 4000))
    throw new AssistantUserError("اكتب سؤالاً بين حرف و4000 حرف.");
  if (input.regenerate && !input.conversationId)
    throw new AssistantUserError("لا يوجد ردّ لإعادة توليده.");
  if (input.conversationId && !(await store.ownsConversation(userId, input.conversationId)))
    throw new AssistantUserError("المحادثة غير موجودة.");

  const q = await store.consumeQuota(userId, "chat", DAILY_CHAT_LIMIT, MINUTE_LIMIT);
  if (!q.allowed) throw new AssistantUserError(quotaMessage(q.reason, DAILY_CHAT_LIMIT), 429);
  try {
    const conversationId =
      input.conversationId || (await store.createConversation(userId, titleFrom(message)));
    if (input.regenerate) {
      const h = await store.history(conversationId, 1);
      const lastMsg = h[h.length - 1];
      if (!lastMsg) throw new AssistantUserError("لا يوجد ردّ لإعادة توليده.");
      if (lastMsg.role === "assistant") await store.deleteMessage(lastMsg.id);
    } else {
      await store.insertMessage(conversationId, "user", message);
    }
    const history = await store.history(conversationId, HISTORY_LIMIT);
    const raw = await complete(await contextMessages(store, userId, history));
    const { text } = groundAnswer(raw);
    const messageId = await store.insertMessage(conversationId, "assistant", text.slice(0, 8000));
    return {
      conversationId,
      messageId,
      text,
      remaining: Math.max(0, DAILY_CHAT_LIMIT - (q.used_today ?? 0)),
    };
  } catch (e) {
    // لا تُحتسب المحاولة الفاشلة من الحصة (A9).
    await store.refundQuota(userId, "chat").catch(() => undefined);
    throw e;
  }
}

export type StreamEvent =
  { type: "start"; conversationId: string } | { type: "delta"; text: string };

/**
 * كـ runAssistant لكن بالبث (12.1): الحصة تُحتسب قبل البث وتُعاد عند الفشل. «إيقاف» (signal) بعد
 * وصول نص يحفظ الجزء الظاهر ولا يعيد الحصة؛ قبل أي نص يعيدها.
 */
export async function runAssistantStream(
  userId: string,
  input: AskInput,
  store: AssistantStore,
  stream: (messages: ChatMessage[], signal?: AbortSignal) => AsyncIterable<string>,
  emit: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<AskResult & { stopped: boolean }> {
  const message = (input.message ?? "").trim();
  if (!input.regenerate && (message.length < 1 || message.length > 4000))
    throw new AssistantUserError("اكتب سؤالاً بين حرف و4000 حرف.");
  if (input.regenerate && !input.conversationId)
    throw new AssistantUserError("لا يوجد ردّ لإعادة توليده.");
  if (input.conversationId && !(await store.ownsConversation(userId, input.conversationId)))
    throw new AssistantUserError("المحادثة غير موجودة.");

  const q = await store.consumeQuota(userId, "chat", DAILY_CHAT_LIMIT, MINUTE_LIMIT);
  if (!q.allowed) throw new AssistantUserError(quotaMessage(q.reason, DAILY_CHAT_LIMIT), 429);
  const g = new StreamGrounder();
  let conversationId: string | null;
  const remaining = Math.max(0, DAILY_CHAT_LIMIT - (q.used_today ?? 0));
  try {
    conversationId =
      input.conversationId || (await store.createConversation(userId, titleFrom(message)));
    emit({ type: "start", conversationId });
    if (input.regenerate) {
      const h = await store.history(conversationId, 1);
      const lastMsg = h[h.length - 1];
      if (!lastMsg) throw new AssistantUserError("لا يوجد ردّ لإعادة توليده.");
      if (lastMsg.role === "assistant") await store.deleteMessage(lastMsg.id);
    } else {
      await store.insertMessage(conversationId, "user", message);
    }
    const history = await store.history(conversationId, HISTORY_LIMIT);
    const messages = await contextMessages(store, userId, history);
    let stopped = false;
    try {
      for await (const chunk of stream(messages, signal)) {
        const piece = g.push(chunk);
        if (piece) emit({ type: "delta", text: piece });
        if (signal?.aborted) {
          stopped = true;
          break;
        }
      }
    } catch (e) {
      if (!signal?.aborted) throw e;
      stopped = true;
    }
    const tail = g.end();
    if (tail) emit({ type: "delta", text: tail });
    const text = g.text.trim();
    if (!text) {
      if (stopped) throw new AiError("أُوقف الرد.", 499, false);
      throw new AiError("ردّ فارغ من خدمة الذكاء الاصطناعي.", 502, true);
    }
    const messageId = await store.insertMessage(conversationId, "assistant", text.slice(0, 8000));
    return { conversationId, messageId, text, remaining, stopped };
  } catch (e) {
    // لا تُحتسب المحاولة الفاشلة (أو الموقوفة قبل أي نص) من الحصة (A9).
    await store.refundQuota(userId, "chat").catch(() => undefined);
    throw e;
  }
}

// ─── السؤال بلا حفظ (المرحلة 6.5) ───
// تلخيص محادثة، أو سؤال خاص داخلها، أو ميزات القرآن. كان دالة خادم في الويب ومساراً منفصلاً في
// Android؛ صار منطقاً واحداً تستعمله دالة Edge «zen-ai» للمنصّتين.

/** الحدود اليومية لكل نمط في السؤال بلا حفظ. */
export const LEGACY_DAILY_LIMITS: Record<AiMode, number> = {
  chat: 120,
  summarize: 60,
  learn: 120,
  feedback: 60,
};
export const LEGACY_MAX_MESSAGES = 30;
export const LEGACY_MAX_CHARS = 4000;
const AI_MODES: readonly AiMode[] = ["chat", "summarize", "learn", "feedback"];

export type LegacyAskInput = {
  mode: AiMode;
  messages: { role: "user" | "assistant"; content: string }[];
};

/**
 * يتحقّق من جسم الطلب بلا اعتماديات (Edge بلا zod): النمط من القائمة وإلا «chat»، والدوران
 * «user» و«assistant» فقط (لا «system» من العميل، حتى لا تُعاد كتابة التعليمات)، وآخر 30 رسالة،
 * وكل رسالة تُقصّ إلى 4000 حرف. الرسائل الفارغة وغير النصية تُحذف.
 */
export function parseLegacyInput(body: unknown): LegacyAskInput {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const mode = AI_MODES.includes(b.mode as AiMode) ? (b.mode as AiMode) : "chat";
  const raw = Array.isArray(b.messages) ? (b.messages as unknown[]) : [];
  const messages = raw
    .filter((m): m is { role: "user" | "assistant"; content: string } => {
      const r = m as { role?: unknown; content?: unknown } | null;
      return (
        !!r &&
        (r.role === "user" || r.role === "assistant") &&
        typeof r.content === "string" &&
        r.content.trim().length > 0
      );
    })
    .slice(-LEGACY_MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, LEGACY_MAX_CHARS) }));
  if (messages.length === 0) throw new AssistantUserError("لا توجد رسائل.");
  return { mode, messages };
}

export const EMPTY_ANSWER = "عذراً، لم أتمكن من توليد رد الآن.";

/** سؤال بلا حفظ: حصة ذرّية لكل نمط، والآيات من المصحف، ولا تُحتسب المحاولة الفاشلة. */
export async function runLegacyAsk(
  userId: string,
  input: LegacyAskInput,
  store: Pick<AssistantStore, "consumeQuota" | "refundQuota">,
  complete: (messages: ChatMessage[]) => Promise<string>,
): Promise<{ text: string }> {
  const daily = LEGACY_DAILY_LIMITS[input.mode];
  const q = await store.consumeQuota(userId, input.mode, daily, MINUTE_LIMIT);
  if (!q.allowed) throw new AssistantUserError(quotaMessage(q.reason, daily), 429);
  try {
    const raw = await complete([
      { role: "system", content: SYSTEM_PROMPTS[input.mode] },
      ...input.messages,
    ]);
    return { text: groundAnswer(raw).text || EMPTY_ANSWER };
  } catch (e) {
    await store.refundQuota(userId, input.mode).catch(() => undefined);
    throw e;
  }
}
