// دالة Supabase Edge لمساعد زِن: المسار الوحيد للمساعد في الويب ونسخة Android (المرحلة 6.5).
// المنطق كله في `_shared/ai-core.ts` (نسخة مطابقة من `src/lib/ai-core.ts`).
//
// النشر: supabase functions deploy zen-ai
// الأسرار: LOVABLE_API_KEY أو OPENAI_API_KEY أو GEMINI_API_KEY (وAI_PROVIDERS اختيارياً).
// SUPABASE_URL وSUPABASE_ANON_KEY وSUPABASE_SERVICE_ROLE_KEY تضبطها المنصة تلقائياً.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import {
  AssistantUserError,
  DAILY_CHAT_LIMIT,
  chatCompleteWith,
  chatStreamWith,
  parseLegacyInput,
  providersFromEnv,
  runAssistant,
  runAssistantStream,
  runLegacyAsk,
  type AssistantStore,
  type ChatMessage,
  type StreamEvent,
} from "../_shared/ai-core.ts";
import { checkAiAccess } from "../_shared/ai-access.ts";
import { BODY_LIMITS, BodyTooLargeError, readJsonLimited } from "../_shared/edge-http.ts";

declare const Deno: {
  env: { toObject(): Record<string, string> };
  serve(h: (req: Request) => Response | Promise<Response>): void;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function sse(
  userId: string,
  input: { conversationId: string | null; message?: string; regenerate: boolean },
  store: AssistantStore,
  env: Record<string, string>,
  clientSignal?: AbortSignal,
): Response {
  const ac = new AbortController();
  clientSignal?.addEventListener("abort", () => ac.abort());
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (o: StreamEvent | Record<string, unknown>) => {
        try {
          ctrl.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
        } catch {
          /* أغلق العميل الاتصال */
        }
      };
      try {
        const r = await runAssistantStream(
          userId,
          input,
          store,
          async function* (m, signal) {
            const { deltas } = await chatStreamWith(m, env, { signal });
            yield* deltas;
          },
          send,
          ac.signal,
        );
        send({ type: "done", ...r });
      } catch (e) {
        send({
          type: "error",
          error: e instanceof Error ? e.message : "تعذّر توليد الرد.",
          status: e instanceof AssistantUserError ? e.status : 502,
          limit: DAILY_CHAT_LIMIT,
        });
      } finally {
        try {
          ctrl.close();
        } catch {
          /* مغلق */
        }
      }
    },
    cancel() {
      ac.abort();
    },
  });
  return new Response(body, {
    headers: {
      ...cors,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST فقط" }, 405);
  const env = Deno.env.toObject();
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "سجّل الدخول لاستخدام المساعد." }, 401);
  const userId = u.user.id;
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  let body: Record<string, unknown>;
  try {
    body = (await readJsonLimited(req, BODY_LIMITS.ai)) as Record<string, unknown>;
  } catch (e) {
    if (e instanceof BodyTooLargeError) return json({ error: e.message }, 413);
    throw e;
  }
  const complete = async (m: ChatMessage[]) => (await chatCompleteWith(m, env)).text;

  if (providersFromEnv(env).length === 0)
    return json({ error: "المساعد الذكي غير مفعّل بعد. تواصل مع إدارة التطبيق." }, 503);

  // الخادم هو الحَكَم (N-02/N-03): المحادثة المحفوظة = «المساعد» (مفتاحه + الموافقة + ليس قاصراً)، والسؤال بلا
  // حفظ (ميزات القرآن وتلخيص المحادثات) = ذكاء نصّي (الموافقة + ليس قاصراً). قبل الحصة وقبل المزوّد.
  const denied = await checkAiAccess(
    (fn, args) => admin.rpc(fn, args),
    userId,
    Array.isArray(body.messages) ? "text" : "assistant",
  );
  if (denied) return json({ error: denied.message, code: denied.code }, denied.status);

  try {
    const store: AssistantStore = {
      async consumeQuota(uid, feature, daily, minute) {
        const { data, error } = await admin.rpc("consume_ai_quota", {
          _user_id: uid,
          _feature: feature,
          _daily_limit: daily,
          _minute_limit: minute,
        });
        if (error) throw new Error(error.message);
        return data as { allowed: boolean; reason?: string; used_today?: number };
      },
      async refundQuota(uid, feature) {
        await admin.rpc("refund_ai_quota", { _user_id: uid, _feature: feature });
      },
      async createConversation(uid, title) {
        const { data, error } = await admin
          .from("ai_conversations")
          .insert({ user_id: uid, title })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        return (data as { id: string }).id;
      },
      async ownsConversation(uid, id) {
        const { data } = await admin
          .from("ai_conversations")
          .select("id")
          .eq("id", id)
          .eq("user_id", uid)
          .maybeSingle();
        return !!data;
      },
      async insertMessage(conversationId, role, content) {
        const { data, error } = await admin
          .from("ai_messages")
          .insert({ conversation_id: conversationId, role, content })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        return (data as { id: string }).id;
      },
      async history(conversationId, limit) {
        const { data } = await admin
          .from("ai_messages")
          .select("id, role, content")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(limit);
        return (
          (data ?? []) as { id: string; role: "user" | "assistant"; content: string }[]
        ).reverse();
      },
      async deleteMessage(id) {
        await admin.from("ai_messages").delete().eq("id", id);
      },
      // 12.2: ملخّص الحفظ فقط عند الموافقة (الدالة تعيد NULL بدونها).
      async memoContext(uid) {
        const { data } = await admin.rpc("ai_memo_context", { _user: uid });
        return data ?? null;
      },
    };
    // السؤال بلا حفظ (تلخيص محادثة أو سؤال خاص داخلها أو ميزات القرآن): رسائل يرسلها العميل.
    if (Array.isArray(body.messages)) {
      return json(await runLegacyAsk(userId, parseLegacyInput(body), store, complete));
    }

    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    const input = {
      conversationId,
      message: typeof body.message === "string" ? body.message : undefined,
      regenerate: body.regenerate === true,
    };
    // البث (12.1): text/event-stream بأحداث start / delta / done / error. قطع العميل للاتصال
    // («إيقاف») يلغي طلب المزوّد فعلاً.
    if (body.stream === true) return sse(userId, input, store, env, req.signal);
    const r = await runAssistant(userId, input, store, complete);
    return json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "تعذّر توليد الرد.";
    return json(
      { error: msg, limit: DAILY_CHAT_LIMIT },
      e instanceof AssistantUserError ? e.status : 502,
    );
  }
});
