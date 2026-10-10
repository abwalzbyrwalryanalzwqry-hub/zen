import { describe, expect, it } from "vitest";
import { BodyTooLargeError, readJsonLimited } from "./edge-http";

const req = (body: string | null, headers: Record<string, string> = {}) =>
  new Request("https://x.test/fn", { method: "POST", body, headers });

describe("readJsonLimited (تدقيق 1.6)", () => {
  it("يقرأ JSON ضمن الحد", async () => {
    expect(await readJsonLimited(req('{"a":1}'), 100)).toEqual({ a: 1 });
  });

  it("الجسم الفارغ أو غير الصالح أو غير الكائن ⇒ {}", async () => {
    expect(await readJsonLimited(req(null), 100)).toEqual({});
    expect(await readJsonLimited(req("not json"), 100)).toEqual({});
    expect(await readJsonLimited(req("[1,2]"), 100)).toEqual({});
  });

  it("يرفض Content-Length المعلَن فوق الحد قبل القراءة", async () => {
    await expect(
      readJsonLimited(req('{"a":1}', { "content-length": "999999" }), 100),
    ).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("يرفض الجسم الفعلي فوق الحد حتى دون Content-Length صحيح", async () => {
    const big = JSON.stringify({ s: "ب".repeat(200) });
    await expect(readJsonLimited(req(big), 100)).rejects.toMatchObject({ status: 413 });
  });
});
