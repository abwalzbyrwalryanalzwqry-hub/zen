import { describe, expect, it } from "vitest";
import { authStorageKey, isAccessExpired, readStoredSession, storedUserId } from "./stored-session";

const store = (v: unknown) => ({ getItem: () => (v === undefined ? null : JSON.stringify(v)) });
const s = { access_token: "x", refresh_token: "r", expires_at: 100, user: { id: "u1" } };

describe("جلسة الجهاز", () => {
  it("مفتاح Supabase من اسم المضيف", () => {
    expect(authStorageKey("https://abc.supabase.co")).toBe("sb-abc-auth-token");
    expect(authStorageKey("not a url")).toBe("");
  });
  it("تُقرأ الجلسة الكاملة والملفوفة، وتُرفض الناقصة", () => {
    expect(readStoredSession(store(s), "k")?.user.id).toBe("u1");
    expect(readStoredSession(store({ currentSession: s }), "k")?.user.id).toBe("u1");
    expect(readStoredSession(store({ ...s, refresh_token: "" }), "k")).toBeNull();
    expect(readStoredSession(store({ ...s, user: null }), "k")).toBeNull();
    expect(readStoredSession({ getItem: () => "{bad" }, "k")).toBeNull();
    expect(readStoredSession(store(undefined), "k")).toBeNull();
    expect(storedUserId(store(s), "k")).toBe("u1");
  });
  it("انتهاء الرمز بهامش دقيقة", () => {
    expect(isAccessExpired({ ...s, expires_at: 1000 } as never, 1000 * 1000 - 61_000)).toBe(false);
    expect(isAccessExpired({ ...s, expires_at: 1000 } as never, 1000 * 1000 - 30_000)).toBe(true);
  });
});
