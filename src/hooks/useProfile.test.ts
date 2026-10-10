import { describe, expect, it, vi } from "vitest";

const eq = vi.fn(async () => ({ error: null as { message: string } | null }));
const update = vi.fn(() => ({ eq }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ update }) },
}));
vi.mock("@/hooks/useSession", () => ({ useSession: () => ({ userId: "u1", guest: false }) }));
vi.mock("@/lib/zen-api", () => ({ getProfile: vi.fn() }));

const { renameProfile, profileKey, PROFILE_NAME_MAX } = await import("./useProfile");

describe("حفظ الاسم (تحليل «المزيد» BUG-01/02)", () => {
  it("يرمي عند رفض الخادم بدل نجاح صامت", async () => {
    eq.mockResolvedValueOnce({ error: { message: "new row violates row-level security" } });
    await expect(renameProfile("u1", "أحمد")).rejects.toThrow(/row-level/);
  });

  it("ينظّف المسافات ويرفض القصير والطويل", async () => {
    await expect(renameProfile("u1", "  أحمد   علي ")).resolves.toBe("أحمد علي");
    expect(update).toHaveBeenLastCalledWith({ name: "أحمد علي" });
    await expect(renameProfile("u1", "أ")).rejects.toThrow("INVALID_NAME");
    await expect(renameProfile("u1", "x".repeat(PROFILE_NAME_MAX + 1))).rejects.toThrow(
      "INVALID_NAME",
    );
  });

  it("مفتاح واحد للملف في كل الشاشات", () => {
    expect(profileKey("u1")).toEqual(["profile", "u1"]);
  });
});
