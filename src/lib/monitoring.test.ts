import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
vi.mock("@/integrations/supabase/rpc", () => ({
  rpc: (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    return Promise.resolve({ data: true, error: null });
  },
}));

import { _resetMonitoring, isNoise, normalizeError, reportError } from "./monitoring";

describe("مراقبة الأخطاء", () => {
  beforeEach(() => {
    calls.length = 0;
    _resetMonitoring();
    vi.stubGlobal("window", {});
    vi.stubGlobal("location", { pathname: "/today" });
    vi.stubGlobal("navigator", { userAgent: "test-agent" });
  });

  it("يتجاهل أخطاء الشبكة والإضافات", () => {
    expect(isNoise("TypeError: Failed to fetch")).toBe(true);
    expect(isNoise("ResizeObserver loop limit exceeded")).toBe(true);
    expect(isNoise("Error: x", "at chrome-extension://abc/x.js:1")).toBe(true);
    expect(isNoise("TypeError: cannot read properties of undefined")).toBe(false);
  });

  it("يطبّع أنواع الأخطاء المختلفة", () => {
    expect(normalizeError(new TypeError("bad")).message).toBe("TypeError: bad");
    expect(normalizeError("نص").message).toBe("نص");
    expect(normalizeError({ code: 1 }).message).toBe('{"code":1}');
  });

  // الإرسال عبر عميل كسول (1.16.0): يصل بعد تحميله.
  it("يرسل الخطأ مرة واحدة ويدمج المكرّر ويرسل المسار بلا معاملات", async () => {
    reportError(new Error("boom"));
    reportError(new Error("boom"));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("log_client_error");
    expect(calls[0].args._url).toBe("/today");
    expect(calls[0].args._message).toBe("Error: boom");
  });

  it("يقف عند 15 خطأً مختلفاً في الصفحة", async () => {
    for (let i = 0; i < 40; i++) reportError(new Error(`e${i}`));
    await vi.waitFor(() => expect(calls).toHaveLength(15));
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toHaveLength(15);
  });

  it("يوسم خطأ حدود الأخطاء باسمها", async () => {
    reportError(new Error("x"), { boundary: "root" });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].args._message).toBe("Error: x [root]");
  });
});
