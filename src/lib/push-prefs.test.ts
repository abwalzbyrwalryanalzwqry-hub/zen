import { describe, expect, it, vi } from "vitest";

let result: { data: unknown; error: { message: string } | null } = { data: null, error: null };
const chain = {
  select: () => chain,
  eq: () => chain,
  maybeSingle: async () => result,
};
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => chain } }));
vi.mock("@/integrations/supabase/rpc", () => ({ rpc: vi.fn() }));

const { fetchPrefs, DEFAULT_PREFS } = await import("./push");

describe("جلب إعدادات التنبيهات (تحليل «المزيد» SEC-03)", () => {
  it("الفشل يرمي ولا يعيد الافتراضية", async () => {
    result = { data: null, error: { message: "Failed to fetch" } };
    await expect(fetchPrefs("u1")).rejects.toThrow();
  });

  it("لا صف = افتراضية بمنطقة الجهاز", async () => {
    result = { data: null, error: null };
    const p = await fetchPrefs("u1");
    expect(p.push_enabled).toBe(DEFAULT_PREFS.push_enabled);
    expect(typeof p.timezone).toBe("string");
  });
});
