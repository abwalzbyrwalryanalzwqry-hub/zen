import { describe, expect, it } from "vitest";
import { checkAiAccess, type DenialRpc } from "./ai-access";

const rpcReturning =
  (data: unknown, error: { message: string } | null = null): DenialRpc =>
  async () => ({ data, error });

describe("بوابة الذكاء الاصطناعي على الخادم (N-02/N-03)", () => {
  it("NULL ⇒ مسموح، ويُسأل بالمستخدم والميزة", async () => {
    let args: Record<string, unknown> = {};
    const rpc: DenialRpc = async (fn, a) => {
      expect(fn).toBe("ai_access_denial");
      args = a;
      return { data: null, error: null };
    };
    expect(await checkAiAccess(rpc, "u1", "text")).toBeNull();
    expect(args).toEqual({ _user: "u1", _feature: "text" });
  });

  it("رموز الرفض تُترجم إلى رسالة ورمز HTTP", async () => {
    expect(await checkAiAccess(rpcReturning("MINOR_BLOCKED"), "u", "assistant")).toMatchObject({
      code: "MINOR_BLOCKED",
      status: 403,
    });
    expect(await checkAiAccess(rpcReturning("FEATURE_OFF"), "u", "recite_ai")).toMatchObject({
      code: "FEATURE_OFF",
      status: 403,
    });
    expect(await checkAiAccess(rpcReturning("CONSENT_REQUIRED"), "u", "text")).toMatchObject({
      code: "CONSENT_REQUIRED",
    });
  });

  it("الفشل مغلق: خطأ أو استثناء أو رمز مجهول ⇒ رفض", async () => {
    expect((await checkAiAccess(rpcReturning(null, { message: "x" }), "u", "text"))?.code).toBe(
      "CHECK_FAILED",
    );
    const throws: DenialRpc = async () => {
      throw new Error("network");
    };
    expect((await checkAiAccess(throws, "u", "text"))?.code).toBe("CHECK_FAILED");
    expect((await checkAiAccess(rpcReturning("WHATEVER"), "u", "text"))?.code).toBe("CHECK_FAILED");
  });

  it("دوال Edge الثلاث تسأل البوابة قبل الحصة", async () => {
    const fs = await import("node:fs");
    for (const fn of ["zen-ai", "zen-tools", "zen-recitation"]) {
      const src = fs.readFileSync(`supabase/functions/${fn}/index.ts`, "utf8");
      const gate = src.indexOf("checkAiAccess(");
      expect(gate, fn).toBeGreaterThan(0);
      const quota = src.indexOf("consume_ai_quota");
      if (quota > 0) expect(gate, fn).toBeLessThan(quota);
    }
  });
});
