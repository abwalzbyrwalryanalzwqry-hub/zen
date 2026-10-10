/**
 * واجهة العميل لمساعد زِن. كل النداءات تذهب إلى دالة Supabase Edge «zen-ai» بمسار واحد للويب ونسخة
 * Android (المرحلة 6.5)، فلا يحتاج المساعد خادم ويب منشوراً ولا أسراراً فيه.
 */
import { supabase } from "@/integrations/supabase/client";
import { EdgeCallError, callEdge } from "@/lib/server-call";
import { sseData, type AskResult } from "@/lib/ai-core";
import { isGuest } from "@/lib/offline/guest";
import { isOnline } from "@/lib/network";
import { TEXT_AI_DECLINED, ensureTextAiConsent } from "@/lib/text-ai-consent";

export { DAILY_CHAT_LIMIT, splitAnswer } from "@/lib/ai-core";
export type { AskResult } from "@/lib/ai-core";

async function viaEdge<T>(body: Record<string, unknown>): Promise<T> {
  // N-03: يسأل مرة قبل أول طلب؛ والخادم يرفض بلا موافقة أو للقاصر على أي حال.
  if (!(await ensureTextAiConsent())) throw new EdgeCallError(TEXT_AI_DECLINED);
  return callEdge<T>("zen-ai", body, {
    offlineMessage: "المساعد يحتاج اتصالاً بالإنترنت.",
    fallbackMessage: "تعذّر الاتصال بالمساعد.",
  });
}

export type LegacyInput = {
  data: {
    mode: "chat" | "summarize" | "learn" | "feedback";
    messages: { role: "user" | "assistant"; content: string }[];
  };
};

/** سؤال بلا حفظ (تلخيص محادثة، سؤال خاص داخلها، ميزات القرآن). */
export async function askLegacy(input: LegacyInput): Promise<{ text: string }> {
  return viaEdge<{ text: string }>(input.data);
}

/** سؤال في محادثة محفوظة على الخادم، أو إعادة توليد آخر ردّ. */
export async function ask(input: {
  conversationId?: string | null;
  message?: string;
  regenerate?: boolean;
}): Promise<AskResult> {
  return viaEdge<AskResult>({ ...input });
}

export type StreamedResult = AskResult & { stopped?: boolean };

/**
 * البث الحي (12.1): يعرض الرد مقطعاً مقطعاً عبر onDelta (منظّفاً من ﴿…﴾ في الخادم). «إيقاف» يلغي
 * الطلب بـ signal فيتوقّف المزوّد فعلاً. onStart يعطي معرّف المحادثة مبكراً (ليبقى صحيحاً عند الإيقاف).
 * إن أعادت الدالة JSON (نسخة قديمة منشورة) يُقبل كما هو.
 */
export async function askStream(
  input: { conversationId?: string | null; message?: string; regenerate?: boolean },
  on: { onStart?: (conversationId: string) => void; onDelta: (text: string) => void },
  signal?: AbortSignal,
): Promise<StreamedResult> {
  if (isGuest()) throw new EdgeCallError("هذه الميزة تحتاج حساباً. سجّل الدخول لاستخدامها.");
  if (!isOnline()) throw new EdgeCallError("المساعد يحتاج اتصالاً بالإنترنت.");
  if (!(await ensureTextAiConsent())) throw new EdgeCallError(TEXT_AI_DECLINED);
  const { data, error } = await supabase.functions.invoke("zen-ai", {
    body: { ...input, stream: true },
    signal,
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const j = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    throw new EdgeCallError(
      (j as { error?: string } | null)?.error ?? "تعذّر الاتصال بالمساعد.",
      ctx?.status,
    );
  }
  if (!(data instanceof Response)) {
    const r = data as AskResult;
    on.onStart?.(r.conversationId);
    on.onDelta(r.text);
    return r;
  }
  if (!data.body) throw new EdgeCallError("تعذّر الاتصال بالمساعد.");
  for await (const raw of sseData(data.body)) {
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (e.type === "start" && typeof e.conversationId === "string") on.onStart?.(e.conversationId);
    else if (e.type === "delta" && typeof e.text === "string") on.onDelta(e.text);
    else if (e.type === "done") return e as unknown as StreamedResult;
    else if (e.type === "error")
      throw new EdgeCallError(
        typeof e.error === "string" ? e.error : "تعذّر توليد الرد.",
        typeof e.status === "number" ? e.status : undefined,
      );
  }
  throw new EdgeCallError("انقطع الرد قبل اكتماله.");
}

export type AiConversation = { id: string; title: string; updated_at: string };
export type AiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  rating: number | null;
  created_at: string;
};

export async function listConversations(): Promise<AiConversation[]> {
  const { data } = await supabase
    .from("ai_conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function loadConversation(id: string): Promise<AiMessage[]> {
  const { data } = await supabase
    .from("ai_messages")
    .select("id, role, content, rating, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data as AiMessage[]) ?? [];
}

export async function deleteConversation(id: string) {
  const { error } = await supabase.from("ai_conversations").delete().eq("id", id);
  if (error) throw error;
}

export async function rateMessage(id: string, rating: 1 | -1 | null) {
  const { error } = await supabase.rpc("rate_ai_message", {
    _id: id,
    _rating: rating as number,
  });
  if (error) throw error;
}

export async function myAiUsage(): Promise<number> {
  const { data } = await supabase.rpc("my_ai_usage", { _feature: "chat" });
  return typeof data === "number" ? data : 0;
}

/** موافقة سياق الحفظ للمساعد (12.2): يمكن سحبها في أي وقت. */
export type AiConsent = {
  memo_context: boolean;
  granted_at: string | null;
  revoked_at: string | null;
};

export async function getAiConsent(): Promise<AiConsent> {
  const { data, error } = await supabase.rpc("my_ai_consent");
  if (error || !data) return { memo_context: false, granted_at: null, revoked_at: null };
  return data as unknown as AiConsent;
}

export async function setAiConsent(memoContext: boolean): Promise<AiConsent> {
  const { data, error } = await supabase.rpc("set_ai_consent", { _memo_context: memoContext });
  if (error) throw new Error("تعذّر حفظ الموافقة.");
  return data as unknown as AiConsent;
}
