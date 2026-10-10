import { describe, expect, it, vi } from "vitest";
import { createClient, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { installOfflineAuth } from "./auth-offline";

vi.mock("@/lib/network", () => ({ isOnline: () => true }));

describe("تجديد الرمز دون اتصال", () => {
  it("بنية المكتبة كما يفترضها التعديل (يفشل هنا عند تحديث يغيّرها)", () => {
    const c = createClient("https://x.supabase.co", "k", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(installOfflineAuth(c.auth)).toBe(true);
    expect(installOfflineAuth(c.auth)).toBe(true);
  });

  it("دون اتصال: فشل فوري قابل للإعادة دون أي طلب، ومع الاتصال الأصل", async () => {
    let online = false;
    const original = vi.fn(async (_t: string) => ({ data: { session: { ok: 1 } }, error: null }));
    const auth = { _refreshAccessToken: original };
    installOfflineAuth(auth, () => online);
    const t0 = Date.now();
    const r = await auth._refreshAccessToken("r");
    expect(Date.now() - t0).toBeLessThan(50);
    expect(isAuthRetryableFetchError(r.error)).toBe(true);
    expect(original).not.toHaveBeenCalled();
    online = true;
    expect((await auth._refreshAccessToken("r")).error).toBeNull();
    expect(original).toHaveBeenCalledWith("r");
  });

  it("بنية غير متوقعة: لا تعديل", () => {
    expect(installOfflineAuth({})).toBe(false);
  });
});
