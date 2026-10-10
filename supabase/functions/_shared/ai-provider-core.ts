/**
 * مزوّدو الذكاء الاصطناعي (Lovable/OpenAI/Gemini) مع التبديل والبث. بلا اعتماديات خارجية؛ نسختها في
 * `supabase/functions/_shared/` مطابقة حرفياً (`scripts/check-shared-mirror.mjs`).
 */

// ─── المزوّدون ───
export type ChatMessage = { role: "system" | "user" | "assistant"; content: unknown };
export type ProviderId = "lovable" | "openai" | "gemini";
type Provider = {
  id: ProviderId;
  url: string;
  model: string;
  /** نماذج بديلة تُجرَّب بالترتيب إن ردّ المزوّد بـ 404 (نموذج غير متاح لهذا المفتاح أو أُوقف). */
  fallbackModels?: string[];
  headers: Record<string, string>;
  audio: boolean;
};
export type Env = Record<string, string | undefined>;

export class AiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** يستحق تجربة المزوّد التالي؟ */
    public retryable: boolean,
  ) {
    super(message);
  }
}

export const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash";
export const GEMINI_FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash-lite",
];

/**
 * قائمة نماذج من متغيّر بيئة مفصول بفواصل (مثل `GEMINI_FALLBACK_MODELS=gemini-x,gemini-y`)، حتى تُغيَّر
 * البدائل من أسرار Edge دون نشر شيفرة جديدة عند إيقاف نموذج. الفارغ يعيد الافتراضي.
 */
export function modelListFromEnv(raw: string | undefined, fallback: string[]): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : fallback;
}

/** النموذج الأساسي ثم البدائل بلا تكرار. */
export function modelsOf(p: { model: string; fallbackModels?: string[] }): string[] {
  return [...new Set([p.model, ...(p.fallbackModels ?? [])])];
}

export function providersFromEnv(env: Env): Provider[] {
  const all: Record<ProviderId, Provider | null> = {
    lovable: env.LOVABLE_API_KEY
      ? {
          id: "lovable",
          url: "https://ai.gateway.lovable.dev/v1/chat/completions",
          model: env.LOVABLE_AI_MODEL || "google/gemini-3-flash-preview",
          headers: { "Lovable-API-Key": env.LOVABLE_API_KEY },
          audio: true,
        }
      : null,
    openai: env.OPENAI_API_KEY
      ? {
          id: "openai",
          url: "https://api.openai.com/v1/chat/completions",
          model: env.OPENAI_MODEL || "gpt-4o-mini",
          fallbackModels: modelListFromEnv(env.OPENAI_FALLBACK_MODELS, []),
          headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
          audio: false,
        }
      : null,
    gemini: env.GEMINI_API_KEY
      ? {
          id: "gemini",
          url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
          // منذ 18 سبتمبر 2026 لا تتاح نماذج 2.5 إلا للمشاريع التي استعملتها سابقاً، فيردّ المفتاح الجديد
          // بـ 404. الافتراضي نموذج مستقر حالي، مع بدائل إن كان GEMINI_MODEL قديماً أو أُوقف النموذج.
          model: env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
          fallbackModels: modelListFromEnv(env.GEMINI_FALLBACK_MODELS, GEMINI_FALLBACK_MODELS),
          headers: { Authorization: `Bearer ${env.GEMINI_API_KEY}` },
          audio: true,
        }
      : null,
  };
  const order = (env.AI_PROVIDERS || "lovable,openai,gemini")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ProviderId => s in all);
  const seen = new Set<ProviderId>();
  const out: Provider[] = [];
  for (const id of order) {
    const p = all[id];
    if (p && !seen.has(id)) {
      seen.add(id);
      out.push(p);
    }
  }
  return out;
}

function hasAudio(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some((c) => (c as { type?: string } | null)?.type === "input_audio"),
  );
}

/** 400 خطأ في الطلب نفسه فلن يُصلحه مزوّد آخر؛ ما عداه (401/402/429/5xx) يُجرَّب فيه التالي. */
function providerError(status: number): AiError {
  if (status === 429) return new AiError("تم تجاوز الحد المسموح مؤقتاً، حاول لاحقاً.", 429, true);
  if (status === 402) return new AiError("انتهت أرصدة الذكاء الاصطناعي.", 402, true);
  return new AiError(`تعذّر توليد الرد (${status}).`, status, status !== 400);
}

async function callOneModel(
  model: string,
  p: Provider,
  messages: ChatMessage[],
  fetchImpl: typeof fetch,
  timeoutMs: number,
) {
  let res: Response;
  try {
    res = await fetchImpl(p.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...p.headers },
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new AiError("تعذّر الوصول إلى خدمة الذكاء الاصطناعي.", 0, true);
  }
  if (!res.ok) throw providerError(res.status);
  const json = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const text = json?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new AiError("ردّ فارغ من خدمة الذكاء الاصطناعي.", res.status, true);
  return text;
}

/** يجرّب نماذج المزوّد بالترتيب: 404 وحده (نموذج غير متاح) ينقل إلى النموذج التالي. */
async function callOne(
  p: Provider,
  messages: ChatMessage[],
  fetchImpl: typeof fetch,
  timeoutMs: number,
) {
  const models = modelsOf(p);
  let last: AiError | null = null;
  for (const m of models) {
    try {
      return await callOneModel(m, p, messages, fetchImpl, timeoutMs);
    } catch (e) {
      last = e instanceof AiError ? e : new AiError("تعذّر توليد الرد.", 0, true);
      if (last.status !== 404) throw last;
    }
  }
  throw last!;
}

/** يجرّب المزوّدين بالترتيب ويعيد أول ردّ ناجح. */
export async function chatCompleteWith(
  messages: ChatMessage[],
  env: Env,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ text: string; provider: ProviderId }> {
  const audio = hasAudio(messages);
  const providers = providersFromEnv(env).filter((p) => !audio || p.audio);
  if (providers.length === 0)
    throw new AiError("لم يُضبط مفتاح أي مزوّد للذكاء الاصطناعي.", 0, false);
  let last: AiError | null = null;
  for (const p of providers) {
    try {
      return {
        text: await callOne(p, messages, opts.fetchImpl ?? fetch, opts.timeoutMs ?? 60_000),
        provider: p.id,
      };
    } catch (e) {
      last = e instanceof AiError ? e : new AiError("تعذّر توليد الرد.", 0, true);
      if (!last.retryable) break;
    }
  }
  throw last!;
}

// ─── البث (المرحلة 12.1) ───

/** يقرأ جسم SSE ويعيد حمولة كل سطر «data:» (بلا «[DONE]»). */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buf += done ? dec.decode() : dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, "");
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          finished = true;
          return;
        }
        if (data) yield data;
      }
      if (done) {
        finished = true;
        const last = buf.trim();
        if (last.startsWith("data:") && last.slice(5).trim() !== "[DONE]")
          yield last.slice(5).trim();
        return;
      }
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
  }
}

/** مقاطع النص من بث مزوّد متوافق مع OpenAI. */
export async function* providerDeltas(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const data of sseData(body)) {
    let d: unknown;
    try {
      d = (JSON.parse(data) as { choices?: Array<{ delta?: { content?: unknown } }> })?.choices?.[0]
        ?.delta?.content;
    } catch {
      continue;
    }
    if (typeof d === "string" && d) yield d;
  }
}

function withSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(timeoutMs);
  if (!signal) return t;
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  return any ? any([t, signal]) : signal;
}

/**
 * يفتح بثاً من أول مزوّد يقبل الطلب. التبديل إلى التالي قبل أول مقطع فقط؛ بعد بدء البث يُبلَّغ
 * الخطأ كما هو (لا يُخلط ردّان).
 */
export async function chatStreamWith(
  messages: ChatMessage[],
  env: Env,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ provider: ProviderId; deltas: AsyncGenerator<string> }> {
  const audio = hasAudio(messages);
  const providers = providersFromEnv(env).filter((p) => !audio || p.audio);
  if (providers.length === 0)
    throw new AiError("لم يُضبط مفتاح أي مزوّد للذكاء الاصطناعي.", 0, false);
  const f = opts.fetchImpl ?? fetch;
  let last: AiError | null = null;
  for (const p of providers) {
    if (opts.signal?.aborted) break;
    let res: Response | null = null;
    for (const model of modelsOf(p)) {
      if (res) await res.body?.cancel().catch(() => undefined);
      try {
        res = await f(p.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...p.headers },
          body: JSON.stringify({ model, messages, stream: true }),
          signal: withSignal(opts.timeoutMs ?? 60_000, opts.signal),
        });
      } catch {
        res = null;
        break;
      }
      if (res.status !== 404) break;
    }
    if (!res) {
      last = new AiError("تعذّر الوصول إلى خدمة الذكاء الاصطناعي.", 0, true);
      continue;
    }
    if (!res.ok || !res.body) {
      last = res.ok
        ? new AiError("ردّ فارغ من خدمة الذكاء الاصطناعي.", res.status, true)
        : providerError(res.status);
      await res.body?.cancel().catch(() => undefined);
      if (!last.retryable) break;
      continue;
    }
    return { provider: p.id, deltas: providerDeltas(res.body) };
  }
  if (opts.signal?.aborted) throw new AiError("أُوقف الرد.", 499, false);
  throw last ?? new AiError("تعذّر توليد الرد.", 0, true);
}
