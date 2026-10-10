import { describe, expect, it, vi } from "vitest";
import { breachCount, sha1Hex } from "./password-breach";

describe("فحص التسريبات بـ k-anonymity (3.1)", () => {
  it("يرسل أول 5 محارف من البصمة فقط ويطابق اللاحقة محلياً", async () => {
    const hash = await sha1Hex("password1");
    expect(hash).toBe("E38AD214943DAAD1D64C102FAEC29DE4AFE9DA3D");
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("https://api.pwnedpasswords.com/range/E38AD");
      return new Response(`0000000000000000000000000000000000A:0\r\n${hash.slice(5)}:2413945\r\n`);
    });
    expect(await breachCount("password1", fetchImpl as unknown as typeof fetch)).toBe(2413945);
    const sent = JSON.stringify(fetchImpl.mock.calls);
    expect(sent).not.toContain("password1");
    expect(sent).not.toContain(hash.slice(5));
  });

  it("غير موجود ⇒ 0", async () => {
    const fetchImpl = vi.fn(async () => new Response("ABC:1\n"));
    expect(await breachCount("Tarteel-7319", fetchImpl as unknown as typeof fetch)).toBe(0);
  });

  it("يفشل مفتوحاً: خطأ شبكة أو حالة غير ناجحة ⇒ 0", async () => {
    const boom = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await breachCount("x1234567", boom as unknown as typeof fetch)).toBe(0);
    const bad = vi.fn(async () => new Response("", { status: 503 }));
    expect(await breachCount("x1234567", bad as unknown as typeof fetch)).toBe(0);
  });
});
