import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOnboardRole,
  finishOnboarding,
  ONBOARDED_KEY,
  onboardRole,
  prefersSignup,
} from "./onboarding";

describe("الترحيب المبسّط (3.11)", () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
    });
  });

  it("اختيار الدور يحفظه ويفتح «حساب جديد»", () => {
    finishOnboarding("guardian");
    expect(localStorage.getItem(ONBOARDED_KEY)).toBe("1");
    expect(onboardRole()).toBe("guardian");
    expect(prefersSignup()).toBe(true);
    clearOnboardRole();
    expect(onboardRole()).toBeNull();
    expect(prefersSignup()).toBe(false);
  });

  it("التجربة دون حساب لا تحفظ دوراً، والقيم الغريبة تُهمل", () => {
    finishOnboarding(null);
    expect(onboardRole()).toBeNull();
    localStorage.setItem("zen-onboard-role", "admin");
    expect(onboardRole()).toBeNull();
  });
});
