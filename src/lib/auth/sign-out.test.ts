import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const signOut = vi.fn(async (_o?: unknown) => {
  calls.push("signOut");
  return { error: null };
});
const disableNativePush = vi.fn(async () => {
  calls.push("push");
});
const clearOfflineCache = vi.fn(async () => {
  calls.push("cache");
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut } } }));
vi.mock("@/lib/native", () => ({
  NATIVE_TOKEN_KEY: "zen-native-push-token",
  disableNativePush: () => disableNativePush(),
}));
vi.mock("@/lib/offline/offline-fetch", () => ({ clearOfflineCache: () => clearOfflineCache() }));

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
} as Storage;

const { ACCOUNT_STORAGE_KEYS, signOutEverywhere, PUSH_UNREGISTER_TIMEOUT_MS } =
  await import("./sign-out");
const { TZ_SYNCED_KEY } = await import("@/lib/account-sync");

describe("الخروج الموحَّد (تحليل «المزيد» SEC-01/02/05)", () => {
  beforeEach(() => {
    calls.length = 0;
    store.clear();
    vi.clearAllMocks();
  });

  it("يلغي رمز الإشعارات قبل إنهاء الجلسة، ثم يمسح الذاكرة والتخزين", async () => {
    const qc = { clear: vi.fn(() => calls.push("qc")) };
    await signOutEverywhere(qc as never);
    expect(calls).toEqual(["push", "signOut", "qc", "cache"]);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("يمسح مفاتيح الحساب ويُبقي تفضيلات الجهاز", async () => {
    for (const k of ACCOUNT_STORAGE_KEYS) store.set(k, "x");
    store.set("zen-locale", "ar");
    store.set("zen-font", "lg");
    store.set("zen-theme", "dark");
    await signOutEverywhere();
    for (const k of ACCOUNT_STORAGE_KEYS) expect(store.has(k)).toBe(false);
    expect(store.get("zen-locale")).toBe("ar");
    expect(store.get("zen-font")).toBe("lg");
    expect(store.get("zen-theme")).toBe("dark");
  });

  it("مفتاح المنطقة الزمنية مطابق لما في account-sync", () => {
    expect(ACCOUNT_STORAGE_KEYS).toContain(TZ_SYNCED_KEY);
  });

  it("النقر المزدوج يشترك في خروج واحد", async () => {
    await Promise.all([signOutEverywhere(), signOutEverywhere()]);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(disableNativePush).toHaveBeenCalledTimes(1);
  });

  it("فشل إلغاء الرمز أو الشبكة لا يمنع الخروج المحلي", async () => {
    disableNativePush.mockRejectedValueOnce(new Error("offline"));
    signOut.mockRejectedValueOnce(new Error("offline"));
    store.set("zen-home-mode", "teacher");
    await expect(signOutEverywhere()).resolves.toBeUndefined();
    expect(store.has("zen-home-mode")).toBe(false);
  });

  it("إلغاء الرمز المعلَّق لا يعلّق الخروج", async () => {
    vi.useFakeTimers();
    disableNativePush.mockImplementationOnce(() => new Promise(() => undefined));
    const p = signOutEverywhere();
    await vi.advanceTimersByTimeAsync(PUSH_UNREGISTER_TIMEOUT_MS + 10);
    await p;
    expect(signOut).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
