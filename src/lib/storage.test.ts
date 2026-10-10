import { afterEach, describe, expect, it, vi } from "vitest";
import { readLocal, readLocalJson, removeLocal, writeLocal, writeLocalJson } from "./storage";

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("التخزين المحلي الآمن", () => {
  it("على الخادم (لا window) لا يرمي", () => {
    expect(readLocal("k")).toBeNull();
    expect(writeLocal("k", "v")).toBe(false);
  });

  it("قراءة وكتابة وحذف و JSON", () => {
    const s = memory();
    vi.stubGlobal("window", { localStorage: s });
    expect(writeLocal("k", "v")).toBe(true);
    expect(readLocal("k")).toBe("v");
    removeLocal("k");
    expect(readLocal("k")).toBeNull();
    writeLocalJson("j", { a: 1 });
    expect(readLocalJson("j", { a: 0 })).toEqual({ a: 1 });
    s.setItem("bad", "{");
    expect(readLocalJson("bad", 7)).toBe(7);
  });

  it("التخزين المعطَّل (SecurityError عند الوصول أو النداء) لا يرمي", () => {
    const deny = () => {
      throw new Error("SecurityError");
    };
    const s = memory();
    s.getItem = deny;
    s.setItem = deny;
    s.removeItem = deny;
    vi.stubGlobal("window", { localStorage: s });
    expect(readLocal("k")).toBeNull();
    expect(writeLocal("k", "v")).toBe(false);
    expect(() => removeLocal("k")).not.toThrow();
    expect(readLocalJson("k", 3)).toBe(3);
    vi.stubGlobal("window", {
      get localStorage() {
        return deny();
      },
    });
    expect(readLocal("k")).toBeNull();
    expect(writeLocal("k", "v")).toBe(false);
  });

  it("كائن غير قابل للتسلسل لا يرمي", () => {
    vi.stubGlobal("window", { localStorage: memory() });
    const o: Record<string, unknown> = {};
    o.self = o;
    expect(writeLocalJson("c", o)).toBe(false);
  });
});
