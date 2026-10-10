import { describe, expect, it } from "vitest";
import { assistantHistory, HISTORY_LIMIT, type AssistantMessage } from "./assistant";

describe("سجل مساعد زِن", () => {
  it("يبقى ضمن حد الخادم مهما طالت المحادثة، ويستبعد الترحيب والأخطاء", () => {
    const all: AssistantMessage[] = [{ from: "ai", text: "مرحباً" }];
    for (let i = 0; i < 40; i++) {
      all.push({ from: "me", text: `سؤال ${i}` });
      all.push(
        i % 5 === 0
          ? { from: "ai", text: "⚠️ خطأ", error: true }
          : { from: "ai", text: `جواب ${i}` },
      );
    }
    const h = assistantHistory(all);
    expect(h.length).toBe(HISTORY_LIMIT);
    expect(h.length).toBeLessThanOrEqual(30);
    expect(h.some((m) => m.content.includes("⚠️"))).toBe(false);
    expect(h.some((m) => m.content === "مرحباً")).toBe(false);
    expect(h[h.length - 1].content).toBe("جواب 39");
  });

  it("يقص الرسالة الطويلة إلى 4000 حرف", () => {
    const h = assistantHistory([
      { from: "ai", text: "مرحباً" },
      { from: "me", text: "ا".repeat(5000) },
    ]);
    expect(h[0].content.length).toBe(4000);
  });
});
