import { beforeEach, describe, expect, it, vi } from "vitest";

// بيئة Node: تخزين بسيط في الذاكرة.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

import {
  SIMPLE_KEY,
  getSimplePreference,
  parseSimplePreference,
  resolveSimpleMode,
  setSimplePreference,
} from "./simple-mode";

describe("الوضع المبسّط", () => {
  beforeEach(() => localStorage.clear());
  it("«تلقائي» يتبع المركز، واختيار المعلّم يعلو عليه", () => {
    expect(resolveSimpleMode("auto", true)).toBe(true);
    expect(resolveSimpleMode("auto", false)).toBe(false);
    expect(resolveSimpleMode("off", true)).toBe(false);
    expect(resolveSimpleMode("on", false)).toBe(true);
  });
  it("القيمة المجهولة «تلقائي»، و«تلقائي» لا يُخزَّن", () => {
    expect(parseSimplePreference("x")).toBe("auto");
    setSimplePreference("on");
    expect(localStorage.getItem(SIMPLE_KEY)).toBe("on");
    expect(getSimplePreference()).toBe("on");
    setSimplePreference("auto");
    expect(localStorage.getItem(SIMPLE_KEY)).toBeNull();
  });
});

describe("«المزيد» في الوضع المبسّط", async () => {
  const { EMPTY_CONTEXT, moreSectionsFor } = await import("@/lib/home");
  const ctx = { ...EMPTY_CONTEXT, is_teacher: true, halaqas_taught: 1 };
  const paths = (simple: boolean) =>
    moreSectionsFor("teacher", ctx, () => true, simple).flatMap((s) => s.links.map((l) => l.to));
  it("يُبقي أدوات اليوم ويُخفي الاستوديو والاستيراد والاختبارات", () => {
    const p = paths(true);
    expect(p).toEqual(
      expect.arrayContaining(["/teacher/register", "/teacher/attendance-code", "/teacher/at-risk"]),
    );
    for (const x of ["/certificates", "/teacher/import", "/exams", "/verify", "/stories"])
      expect(p).not.toContain(x);
    expect(paths(false)).toContain("/certificates");
  });
});
