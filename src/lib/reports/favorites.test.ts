import { beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "./config";
import {
  addFavorite,
  applyShape,
  loadFavorites,
  loadLast,
  markLast,
  removeFavorite,
  shapeOf,
} from "./favorites";

// بيئة الاختبارات بلا متصفح: تخزين في الذاكرة بالواجهة نفسها.
const mem = new Map<string, string>();
globalThis.localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
} as Storage;

const H = "h1";
const base = () => defaultConfig("2026-10-06", "");

describe("report shortcuts", () => {
  beforeEach(() => localStorage.clear());

  it("keeps at most three named favorites and replaces same-name ones", () => {
    const c = base();
    addFavorite(H, "أ", c);
    addFavorite(H, "ب", { ...c, kind: "attendance" });
    addFavorite(H, "ج", c);
    addFavorite(H, "د", c);
    expect(loadFavorites(H).map((f) => f.name)).toEqual(["ب", "ج", "د"]);
    addFavorite(H, "ب", { ...c, kind: "student" });
    const list = loadFavorites(H);
    expect(list.map((f) => f.name)).toEqual(["ج", "د", "ب"]);
    expect(list[2].shape.kind).toBe("student");
    expect(removeFavorite(H, list[0].id).map((f) => f.name)).toEqual(["د", "ب"]);
    expect(addFavorite(H, "   ", c)).toHaveLength(2);
  });

  it("re-applies a preset range against today and keeps custom dates", () => {
    const month = shapeOf({ ...base(), preset: "month", from: "2026-08-01", to: "2026-08-20" });
    const a = applyShape(base(), month, "2026-11-15");
    expect([a.from, a.to]).toEqual(["2026-11-01", "2026-11-15"]);
    const custom = shapeOf({ ...base(), preset: "custom", from: "2026-08-03", to: "2026-08-09" });
    const b = applyShape(base(), custom, "2026-11-15");
    expect([b.from, b.to]).toEqual(["2026-08-03", "2026-08-09"]);
  });

  it("does not carry identity in a shape and remembers the last export", () => {
    const c = { ...base(), colors: { ...base().colors, primary: "#123456" } };
    expect("colors" in shapeOf(c)).toBe(false);
    expect(applyShape(base(), shapeOf(c), "2026-10-06").colors.primary).toBe(base().colors.primary);
    expect(loadLast(H)).toBeNull();
    markLast(H, { ...c, kind: "achievement" });
    expect(loadLast(H)?.shape.kind).toBe("achievement");
  });
});
