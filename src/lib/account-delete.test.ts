import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const rpcResult: Record<string, { data?: unknown; error: { message: string } | null }> = {};
const rpc = vi.fn(async (name: string) => {
  calls.push(`rpc:${name}`);
  return rpcResult[name] ?? { data: null, error: null };
});
const remove = vi.fn(async (names: string[]) => {
  calls.push(`remove:${names.length}`);
  return { error: null };
});

vi.mock("@/integrations/supabase/rpc", () => ({ rpc: (n: string) => rpc(n) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ remove }) },
    auth: { getSession: async () => ({ data: { session: { user: { id: "me" } } } }) },
  },
}));
vi.mock("@/lib/native-file", () => ({ saveFile: vi.fn() }));
vi.mock("@/lib/auth/sign-out", () => ({
  signOutEverywhere: vi.fn(async () => void calls.push("signOut")),
}));
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  length: 0,
} as Storage;

const { deleteMyAccount, DELETE_CONFIRM_PHRASE } = await import("./account");

describe("حذف الحساب (تحليل «المزيد» SEC-04)", () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(rpcResult)) delete rpcResult[k];
  });

  it("الفحص أولاً، ثم الملفات، ثم الحذف، ثم تنظيف الجهاز", async () => {
    rpcResult.my_storage_objects = {
      data: [{ bucket_id: "recitations", name: "a.webm" }],
      error: null,
    };
    await deleteMyAccount(DELETE_CONFIRM_PHRASE);
    expect(calls).toEqual([
      "rpc:delete_my_account_check",
      "rpc:my_storage_objects",
      "remove:1",
      "rpc:delete_my_account",
      "signOut",
    ]);
  });

  it("رفض الفحص لا يمسّ الملفات", async () => {
    rpcResult.delete_my_account_check = {
      error: { message: "P0001: أنت المالك الوحيد لمركز فيه أعضاء آخرون." },
    };
    await expect(deleteMyAccount(DELETE_CONFIRM_PHRASE)).rejects.toThrow(/المالك الوحيد/);
    expect(calls).toEqual(["rpc:delete_my_account_check"]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("العبارة الخاطئة تُرفض قبل أي نداء", async () => {
    await expect(deleteMyAccount("نعم")).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
