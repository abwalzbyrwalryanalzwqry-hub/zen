import { describe, expect, it } from "vitest";
import {
  StreamGrounder,
  chatStreamWith,
  groundAnswer,
  runAssistantStream,
  sseData,
  type AssistantStore,
  type StreamEvent,
} from "./ai-core";

const enc = new TextEncoder();
function bodyOf(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const x of chunks) c.enqueue(enc.encode(x));
      c.close();
    },
  });
}
const sseOf = (deltas: string[]) =>
  deltas
    .map((d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`)
    .join("") + "data: [DONE]\n\n";

describe("sseData (12.1)", () => {
  it("يجمع الأسطر المقطوعة بين الحزم ويتوقف عند [DONE]", async () => {
    const raw = sseOf(["أ", "ب"]);
    const parts = [raw.slice(0, 7), raw.slice(7, 40), raw.slice(40)];
    const out: string[] = [];
    for await (const d of sseData(bodyOf(parts))) out.push(d);
    expect(out.map((x) => JSON.parse(x).choices[0].delta.content)).toEqual(["أ", "ب"]);
  });
});

describe("StreamGrounder (12.1)", () => {
  const sample = "قال تعالى ﴿نص كتبه النموذج﴾ ثم [[البقرة:255]] و[[سورة وهمية:3]] وانتهى ﴿آخر﴾.";
  it("مجموع المقاطع = groundAnswer للرد كاملاً مهما كان التقطيع", () => {
    const want = groundAnswer(sample).text;
    for (const size of [1, 2, 3, 5, 8, 13, 100]) {
      const g = new StreamGrounder();
      const seen: string[] = [];
      for (let i = 0; i < sample.length; i += size) seen.push(g.push(sample.slice(i, i + size)));
      seen.push(g.end());
      expect(seen.join("")).toBe(want);
      expect(g.text).toBe(want);
      // لا يظهر نص بين ﴿ ﴾ في أي مقطع.
      for (const piece of seen) expect(piece).not.toMatch(/﴿[^﴾…]/);
    }
  });
  it("يُمسك الاقتباس المفتوح حتى يُغلق", () => {
    const g = new StreamGrounder();
    expect(g.push("مرحباً ﴿بسم")).toBe("مرحباً ");
    expect(g.push(" الله")).toBe("");
    expect(g.push("﴾ تم")).toBe("﴿…﴾ تم");
  });
});

function fakeStore(log: string[]): AssistantStore {
  let n = 0;
  return {
    async consumeQuota() {
      log.push("quota");
      return { allowed: true, used_today: 3 };
    },
    async refundQuota() {
      log.push("refund");
    },
    async createConversation() {
      return "c1";
    },
    async ownsConversation() {
      return true;
    },
    async insertMessage(_c, role, content) {
      log.push(`insert:${role}:${content}`);
      return `m${++n}`;
    },
    async history() {
      return [{ id: "u", role: "user", content: "س" }];
    },
    async deleteMessage() {},
  };
}

describe("runAssistantStream (12.1)", () => {
  it("الحصة قبل البث، والمقاطع منظّفة، والرد يُحفظ", async () => {
    const log: string[] = [];
    const events: StreamEvent[] = [];
    const r = await runAssistantStream(
      "u1",
      { message: "سؤال" },
      fakeStore(log),
      async function* () {
        yield "جواب ﴿نص";
        yield "﴾ مفيد";
      },
      (e) => events.push(e),
    );
    expect(log[0]).toBe("quota");
    expect(events[0]).toEqual({ type: "start", conversationId: "c1" });
    const text = events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("");
    expect(text).toBe("جواب ﴿…﴾ مفيد");
    expect(r).toMatchObject({ text: "جواب ﴿…﴾ مفيد", stopped: false, remaining: 117 });
    expect(log).toContain("insert:assistant:جواب ﴿…﴾ مفيد");
    expect(log).not.toContain("refund");
  });
  it("الفشل أثناء البث يعيد الحصة", async () => {
    const log: string[] = [];
    await expect(
      runAssistantStream(
        "u1",
        { message: "سؤال" },
        fakeStore(log),
        async function* () {
          yield "بداية";
          throw new Error("انقطع");
        },
        () => undefined,
      ),
    ).rejects.toThrow("انقطع");
    expect(log).toContain("refund");
    expect(log.some((l) => l.startsWith("insert:assistant"))).toBe(false);
  });
  it("الإيقاف بعد نص يحفظ الظاهر ولا يعيد الحصة، وقبل أي نص يعيدها", async () => {
    const ac = new AbortController();
    const log: string[] = [];
    const r = await runAssistantStream(
      "u1",
      { message: "سؤال" },
      fakeStore(log),
      async function* (_m, signal) {
        yield "جزء أول";
        ac.abort();
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        yield "لن يصل";
      },
      () => undefined,
      ac.signal,
    );
    expect(r).toMatchObject({ stopped: true, text: "جزء أول" });
    expect(log).not.toContain("refund");

    const ac2 = new AbortController();
    ac2.abort();
    const log2: string[] = [];
    await expect(
      runAssistantStream(
        "u1",
        { message: "سؤال" },
        fakeStore(log2),
        // eslint-disable-next-line require-yield
        async function* () {
          throw new DOMException("aborted", "AbortError");
        },
        () => undefined,
        ac2.signal,
      ),
    ).rejects.toThrow("أُوقف");
    expect(log2).toContain("refund");
  });
});

describe("chatStreamWith (12.1)", () => {
  it("يبدّل المزوّد قبل البث عند 500، ويرسل stream: true", async () => {
    const bodies: unknown[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      if (String(url).includes("lovable")) return new Response("x", { status: 500 });
      return new Response(bodyOf([sseOf(["مرحبا", " بك"])]), { status: 200 });
    }) as unknown as typeof fetch;
    const { provider, deltas } = await chatStreamWith(
      [{ role: "user", content: "س" }],
      { LOVABLE_API_KEY: "a", OPENAI_API_KEY: "b" },
      { fetchImpl },
    );
    const out: string[] = [];
    for await (const d of deltas) out.push(d);
    expect(provider).toBe("openai");
    expect(out.join("")).toBe("مرحبا بك");
    expect(bodies.every((b) => (b as { stream: boolean }).stream === true)).toBe(true);
  });
  it("400 لا يُجرَّب فيه التالي", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response("bad", { status: 400 });
    }) as unknown as typeof fetch;
    await expect(
      chatStreamWith(
        [{ role: "user", content: "س" }],
        { LOVABLE_API_KEY: "a", OPENAI_API_KEY: "b" },
        { fetchImpl },
      ),
    ).rejects.toThrow("400");
    expect(calls).toBe(1);
  });
});

describe("سياق الحفظ بموافقة (12.2)", () => {
  it("يصاغ سطوراً قصيرة بلا نص آيات، وnull إن لم يوجد", async () => {
    const { formatMemoContext } = await import("./ai-core");
    expect(formatMemoContext(null)).toBeNull();
    expect(formatMemoContext({ queue: { items: [] }, errors: [] })).toBeNull();
    const t = formatMemoContext({
      queue: {
        total_minutes: 25,
        items: [
          { kind: "review", surah_name: "الملك", from_ayah: 1, to_ayah: 10 },
          { kind: "wird", done: true },
        ],
      },
      errors: [{ surah_name: "النبإ", from_ayah: 5, to_ayah: 5 }],
      memorized_pages: 40,
      streak: 3,
    })!;
    expect(t).toContain("مراجعة الملك 1-10");
    expect(t).toContain("النبإ 5");
    expect(t).not.toContain("الورد");
    expect(t).toContain("صفحات محفوظة: 40");
    expect(t.length).toBeLessThan(1100);
  });
  it("يضاف تعليماتٍ للنموذج فقط عند وجود السياق", async () => {
    const seen: unknown[][] = [];
    const log: string[] = [];
    const store = { ...fakeStore(log), memoContext: async () => ({ memorized_pages: 12 }) };
    await runAssistantStream(
      "u1",
      { message: "س" },
      store,
      async function* (m) {
        seen.push(m);
        yield "ر";
      },
      () => undefined,
    );
    const sys = (seen[0] as { role: string; content: string }[]).filter((x) => x.role === "system");
    expect(sys).toHaveLength(2);
    expect(sys[1].content).toContain("صفحات محفوظة: 12");

    const store2 = { ...fakeStore(log), memoContext: async () => null };
    await runAssistantStream(
      "u1",
      { message: "س" },
      store2,
      async function* (m) {
        seen.push(m);
        yield "ر";
      },
      () => undefined,
    );
    expect((seen[1] as { role: string }[]).filter((x) => x.role === "system")).toHaveLength(1);
  });
});
