import { beforeEach, describe, expect, it, vi } from "vitest";

// بيئة Node: تخزين بسيط في الذاكرة.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

import { lastReason, rememberReason, LAST_REASON_KEY } from "./last-reason";
import { markTipSeen, seenTips } from "./first-use-tips";

describe("آخر سبب للطالب", () => {
  beforeEach(() => localStorage.clear());
  it("يحفظ آخر سبب ويتجاهل الفارغ", () => {
    rememberReason("s1", "مرض");
    rememberReason("s1", "  ");
    expect(lastReason("s1")).toBe("مرض");
    rememberReason("s1", "سفر");
    expect(lastReason("s1")).toBe("سفر");
    expect(lastReason("s2")).toBeNull();
  });
  it("حدّ 400 طالب: الأقدم يُحذف", () => {
    for (let i = 0; i < 405; i++) rememberReason(`s${i}`, "مرض");
    const s = JSON.parse(localStorage.getItem(LAST_REASON_KEY)!) as Record<string, string>;
    expect(Object.keys(s)).toHaveLength(400);
    expect(lastReason("s0")).toBeNull();
    expect(lastReason("s404")).toBe("مرض");
  });
  it("التلميح يُغلق مرة ولا يعود", () => {
    expect(seenTips().has("swipe")).toBe(false);
    markTipSeen("swipe");
    markTipSeen("swipe");
    expect([...seenTips()]).toEqual(["swipe"]);
  });
});

describe("التلميحات لكل حساب (1.21.1)", () => {
  beforeEach(() => localStorage.clear());
  it("حسابان على جهاز واحد: لكلٍّ تلميحاته، والضيف بالمفتاح القديم", () => {
    markTipSeen("swipe", "u1");
    expect(seenTips("u1").has("swipe")).toBe(true);
    expect(seenTips("u2").has("swipe")).toBe(false);
    expect(seenTips().has("swipe")).toBe(false);
  });
  it("ما في بيانات الحساب يُحترم على جهاز جديد", () => {
    expect(seenTips("u3", ["designer", 5]).has("designer")).toBe(true);
    expect([...markTipSeen("ayahGrid", "u3", ["designer"])].sort()).toEqual([
      "ayahGrid",
      "designer",
    ]);
  });
});
