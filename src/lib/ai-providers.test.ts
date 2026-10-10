import { describe, expect, it, vi } from "vitest";
import {
  AiError,
  GEMINI_DEFAULT_MODEL,
  GEMINI_FALLBACK_MODELS,
  chatCompleteWith,
  chatStreamWith,
  modelsOf,
  providersFromEnv,
  type ChatMessage,
  type Env,
} from "./ai-core";

// طبقة المزوّدين في `ai-core.ts` (تستعملها دوال Edge). كان لها غلاف خادم حُذف في المرحلة 6.5.
const chatComplete = (m: ChatMessage[], o: { env: Env; fetchImpl?: typeof fetch }) =>
  chatCompleteWith(m, o.env, { fetchImpl: o.fetchImpl });

const ok = (text: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });

describe("طبقة مزوّدي الذكاء الاصطناعي", () => {
  it("الترتيب من AI_PROVIDERS، ويُسقط غير المضبوط والمكرّر", () => {
    const env = {
      AI_PROVIDERS: "gemini, openai,gemini,x",
      GEMINI_API_KEY: "g",
      LOVABLE_API_KEY: "l",
    };
    expect(providersFromEnv(env).map((p) => p.id)).toEqual(["gemini"]);
    expect(
      providersFromEnv({ LOVABLE_API_KEY: "l", OPENAI_API_KEY: "o" }).map((p) => p.id),
    ).toEqual(["lovable", "openai"]);
    expect(providersFromEnv({})).toEqual([]);
  });

  it("ينتقل للمزوّد التالي عند 429/5xx أو ردّ فارغ", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(ok(""))
      .mockResolvedValueOnce(ok("مرحباً"));
    const env = { LOVABLE_API_KEY: "l", OPENAI_API_KEY: "o", GEMINI_API_KEY: "g" };
    const r = await chatComplete([{ role: "user", content: "x" }], { env, fetchImpl });
    expect(r).toEqual({ text: "مرحباً", provider: "gemini" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[1][0]).toContain("api.openai.com");
  });

  it("لا ينتقل عند 400 (خطأ في الطلب نفسه)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 400 }));
    const env = { LOVABLE_API_KEY: "l", OPENAI_API_KEY: "o" };
    await expect(
      chatComplete([{ role: "user", content: "x" }], { env, fetchImpl }),
    ).rejects.toBeInstanceOf(AiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("الرسائل الصوتية لا تُرسل لمزوّد لا يقبل الصوت", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok("نص"));
    const env = { AI_PROVIDERS: "openai,gemini", OPENAI_API_KEY: "o", GEMINI_API_KEY: "g" };
    const r = await chatComplete(
      [
        {
          role: "user",
          content: [{ type: "input_audio", input_audio: { data: "", format: "webm" } }],
        },
      ],
      { env, fetchImpl },
    );
    expect(r.provider).toBe("gemini");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("بلا مفاتيح: خطأ واضح", async () => {
    await expect(chatComplete([{ role: "user", content: "x" }], { env: {} })).rejects.toThrow(
      "لم يُضبط",
    );
  });

  it("Gemini: الافتراضي نموذج حالي لا 2.5 (المحصور منذ سبتمبر 2026)", () => {
    const [g] = providersFromEnv({ GEMINI_API_KEY: "g" });
    expect(g.model).toBe("gemini-3.5-flash");
  });

  it("Gemini: 404 (نموذج غير متاح للمفتاح) ينقل إلى النموذج البديل", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(ok("وعليكم السلام"));
    const env = { GEMINI_API_KEY: "g", GEMINI_MODEL: "gemini-2.5-flash" };
    const r = await chatComplete([{ role: "user", content: "x" }], { env, fetchImpl });
    expect(r).toEqual({ text: "وعليكم السلام", provider: "gemini" });
    const models = fetchImpl.mock.calls.map((c) => JSON.parse(c[1].body).model);
    expect(models).toEqual(["gemini-2.5-flash", "gemini-3.5-flash"]);
  });

  it("Gemini: البث ينتقل إلى النموذج البديل عند 404", async () => {
    const sse = new Response(
      'data: {"choices":[{"delta":{"content":"أهلاً"}}]}\n\ndata: [DONE]\n\n',
      { status: 200 },
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(sse);
    const { deltas } = await chatStreamWith(
      [{ role: "user", content: "x" }],
      { GEMINI_API_KEY: "g", GEMINI_MODEL: "gemini-2.5-flash" },
      { fetchImpl },
    );
    let text = "";
    for await (const d of deltas) text += d;
    expect(text).toBe("أهلاً");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("Gemini: 404 في كل النماذج يعطي خطأ واضحاً دون حلقة لا تنتهي", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    await expect(
      chatComplete([{ role: "user", content: "x" }], { env: { GEMINI_API_KEY: "g" }, fetchImpl }),
    ).rejects.toBeInstanceOf(AiError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe("بدائل النماذج من البيئة", () => {
  it("GEMINI_FALLBACK_MODELS يستبدل البدائل الافتراضية بلا تكرار", () => {
    const [g] = providersFromEnv({
      GEMINI_API_KEY: "g",
      GEMINI_MODEL: "gemini-a",
      GEMINI_FALLBACK_MODELS: " gemini-b , ,gemini-a,gemini-c",
    });
    expect(modelsOf(g)).toEqual(["gemini-a", "gemini-b", "gemini-c"]);
  });

  it("بلا متغيّر تبقى البدائل الافتراضية", () => {
    const [g] = providersFromEnv({ GEMINI_API_KEY: "g" });
    expect(modelsOf(g)).toEqual([...new Set([GEMINI_DEFAULT_MODEL, ...GEMINI_FALLBACK_MODELS])]);
  });

  it("OPENAI_FALLBACK_MODELS اختياري", () => {
    const [o] = providersFromEnv({ OPENAI_API_KEY: "o", OPENAI_FALLBACK_MODELS: "gpt-x" });
    expect(modelsOf(o)).toEqual(["gpt-4o-mini", "gpt-x"]);
  });
});
