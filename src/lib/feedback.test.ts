import { describe, expect, it } from "vitest";
import { feedbackError, safeRoute } from "./feedback";

describe("البلاغات (GAP-02)", () => {
  it("يطابق قيود الخادم: 5–2000 حرف بعد القص", () => {
    expect(feedbackError({ kind: "bug", message: "  قص  " })).not.toBeNull();
    expect(feedbackError({ kind: "bug", message: "زر الحفظ لا يعمل" })).toBeNull();
    expect(feedbackError({ kind: "idea", message: "x".repeat(2001) })).not.toBeNull();
  });
  it("السياق مسار داخلي بلا استعلام ولا وسم", () => {
    expect(safeRoute("/settings/notifications?token=abc#x")).toBe("/settings/notifications");
    expect(safeRoute("https://evil.example")).toBeNull();
    expect(safeRoute("//evil.example")).toBeNull();
    expect(safeRoute(undefined)).toBeNull();
  });
});
