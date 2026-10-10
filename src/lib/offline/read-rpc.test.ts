/**
 * تصنيف دوال RPC للعمل دون اتصال من الترحيلات نفسها: ما يُخزَّن يجب أن يكون STABLE (لا يغيّر شيئاً على
 * الخادم)، وكل دالة STABLE يستدعيها التطبيق تُخزَّن أو تُستثنى بسبب مكتوب. دالة قراءة جديدة لا تُنسى
 * فتتعطّل شاشتها دون اتصال.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NO_CACHE_RPC, READ_RPC } from "./offline-fetch";

const ROOT = path.resolve(__dirname, "../../..");

function volatility(): Map<string, string> {
  const dir = path.join(ROOT, "supabase/migrations");
  const out = new Map<string, string>();
  for (const f of fs
    .readdirSync(dir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    const re =
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z_0-9]+)"?\s*\(([\s\S]*?)\$(\w*)\$/gi;
    for (const m of sql.matchAll(re)) {
      const head = m[2];
      out.set(
        m[1],
        /\bIMMUTABLE\b/i.test(head)
          ? "IMMUTABLE"
          : /\bSTABLE\b/i.test(head)
            ? "STABLE"
            : "VOLATILE",
      );
    }
    for (const m of sql.matchAll(
      /ALTER\s+FUNCTION\s+(?:public\.)?([a-z_0-9]+)\s*\([^)]*\)\s+(STABLE|VOLATILE|IMMUTABLE)/gi,
    ))
      out.set(m[1], m[2].toUpperCase());
  }
  return out;
}

function calledRpcs(): Set<string> {
  const names = new Set<string>();
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) {
        for (const m of fs.readFileSync(p, "utf8").matchAll(/rpc\(\s*"([a-z_0-9]+)"/g))
          names.add(m[1]);
      }
    }
  };
  walk(path.join(ROOT, "src"));
  return names;
}

describe("دوال القراءة دون اتصال", () => {
  const vol = volatility();
  const called = calledRpcs();

  it("كل ما يُخزَّن دالة قراءة (STABLE) معرَّفة في الترحيلات", () => {
    const bad = [...READ_RPC].filter((n) => !["STABLE", "IMMUTABLE"].includes(vol.get(n) ?? ""));
    expect(bad).toEqual([]);
  });

  it("كل دالة قراءة يستدعيها التطبيق مخزَّنة أو مستثناة بسبب", () => {
    const missing = [...called].filter(
      (n) =>
        ["STABLE", "IMMUTABLE"].includes(vol.get(n) ?? "") && !READ_RPC.has(n) && !NO_CACHE_RPC[n],
    );
    expect(missing).toEqual([]);
  });

  it("لا تداخل بين المخزَّن والمستثنى", () => {
    expect(Object.keys(NO_CACHE_RPC).filter((n) => READ_RPC.has(n))).toEqual([]);
  });
});
