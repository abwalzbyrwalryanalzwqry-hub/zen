import { describe, expect, it } from "vitest";
import { decideBack, EXIT_WINDOW_MS, normalizePath } from "./back-nav";

const base = { overlayOpen: false, canGoBack: true, lastExitPress: null, now: 10_000 };

describe("زر الرجوع", () => {
  it("يغلق النافذة المفتوحة أولاً", () => {
    expect(decideBack({ ...base, path: "/today", overlayOpen: true })).toBe("close-overlay");
  });
  it("في الرئيسية: ضغطة تنبّه، والثانية خلال المهلة تُخرج", () => {
    expect(decideBack({ ...base, path: "/today" })).toBe("confirm-exit");
    expect(decideBack({ ...base, path: "/today/", lastExitPress: 9_000 })).toBe("exit");
    expect(
      decideBack({ ...base, path: "/today", lastExitPress: 10_000 - EXIT_WINDOW_MS - 1 }),
    ).toBe("confirm-exit");
    expect(decideBack({ ...base, path: "/auth/login" })).toBe("confirm-exit");
  });
  it("في الصفحات الأخرى: رجوع، أو الرئيسية إن لم يوجد سجلّ", () => {
    expect(decideBack({ ...base, path: "/settings" })).toBe("history-back");
    expect(decideBack({ ...base, path: "/mushaf?page=3", canGoBack: false })).toBe("go-home");
  });
  it("تطبيع المسار", () => {
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("/exams/result/?x=1")).toBe("/exams/result");
  });
});
