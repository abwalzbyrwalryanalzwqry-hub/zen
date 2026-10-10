import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * حارس سهولة الاستخدام: كل زر أو رابط محتواه أيقونة وحدها يحتاج aria-label،
 * وإلا قرأه قارئ الشاشة «زر» بلا اسم. ولا مقاسات خط بالبكسل (لا تكبر مع إعداد الخط).
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "ui" ? [] : files(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

const ICON_ONLY =
  /<(button|Link|a)\b((?:[^<>]|=>|\{[^{}]*\})*?)>\s*(?:\{[^{}]*\?\s*\(?\s*)?<([A-Z]\w+)\b[^<>]*\/>\s*(?:\)?\s*:\s*\(?\s*<[A-Z]\w+\b[^<>]*\/>\s*\)?\s*\})?\s*<\/\1>/g;

describe("سهولة الاستخدام في الواجهة", () => {
  const all = files(join(process.cwd(), "src"));

  it("لا زر أيقونة بلا aria-label", () => {
    const missing: string[] = [];
    for (const f of all) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(ICON_ONLY)) {
        if (!m[2].includes("aria-label")) {
          missing.push(`${f.replace(process.cwd(), "")}:${s.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("لا مقاسات خط بالبكسل", () => {
    const px = all.filter((f) => /text-\[\d+px\]/.test(readFileSync(f, "utf8")));
    expect(px).toEqual([]);
  });
});
