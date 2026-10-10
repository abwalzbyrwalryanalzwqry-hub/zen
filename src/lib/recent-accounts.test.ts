import { beforeEach, describe, expect, it } from "vitest";
import { ACCOUNT_STORAGE_KEYS } from "./auth/sign-out";
import {
  RECENT_ACCOUNTS_KEY,
  forgetAccount,
  otherAccounts,
  readRecentAccounts,
  rememberAccount,
  updateRecentName,
} from "./recent-accounts";

describe("الحسابات على هذا الجهاز (GAP-09)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });
  it("الأحدث أولاً، بلا تكرار، وخمسة على الأكثر", () => {
    for (let i = 1; i <= 7; i++) rememberAccount({ userId: `u${i}`, username: `user${i}` });
    rememberAccount({ userId: "u5", username: "user5" });
    const l = readRecentAccounts();
    expect(l.map((r) => r.userId)).toEqual(["u5", "u7", "u6", "u4", "u3"]);
  });
  it("لا يحفظ إلا الاسمين (لا رموز ولا كلمات مرور)", () => {
    rememberAccount({ userId: "u1", username: " ahmad ", name: "أحمد" });
    const raw = JSON.parse(localStorage.getItem(RECENT_ACCOUNTS_KEY)!);
    expect(Object.keys(raw[0]).sort()).toEqual(["at", "name", "userId", "username"]);
    expect(raw[0].username).toBe("ahmad");
  });
  it("تحديث الاسم والحذف والحسابات الأخرى", () => {
    rememberAccount({ userId: "u1", username: "a" });
    rememberAccount({ userId: "u2", username: "b" });
    updateRecentName("u1", "علي");
    updateRecentName("u9", "غريب");
    expect(readRecentAccounts().find((r) => r.userId === "u1")?.name).toBe("علي");
    expect(readRecentAccounts()).toHaveLength(2);
    expect(otherAccounts("u2").map((r) => r.username)).toEqual(["a"]);
    forgetAccount("u1");
    expect(otherAccounts("u2")).toEqual([]);
  });
  it("القيم التالفة تُتجاهل، والقائمة لا تُمسح مع بيانات الحساب عند الخروج", () => {
    localStorage.setItem(RECENT_ACCOUNTS_KEY, '[{"userId":1},"x",null]');
    expect(readRecentAccounts()).toEqual([]);
    localStorage.setItem(RECENT_ACCOUNTS_KEY, "{bad");
    expect(readRecentAccounts()).toEqual([]);
    expect(ACCOUNT_STORAGE_KEYS).not.toContain(RECENT_ACCOUNTS_KEY);
  });
});
