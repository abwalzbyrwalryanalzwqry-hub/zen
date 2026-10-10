import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * M11: مكتبات دوال Edge بنسخ دقيقة. `npm:pkg@2` يجلب أحدث 2.x عند كل نشر فقد ينكسر النشر فجأة؛
 * النسخة الدقيقة تتغيّر عمداً فقط (مع package.json).
 */
const ROOT = join(__dirname, "../../supabase/functions");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("نسخ مكتبات دوال Edge", () => {
  it("كل استيراد npm: أو jsr: بنسخة دقيقة (x.y.z)", () => {
    const loose: string[] = [];
    for (const f of files(ROOT)) {
      for (const m of readFileSync(f, "utf8").matchAll(/"(?:npm|jsr):(@?[^@"]+)@([^"/]+)/g)) {
        if (!/^\d+\.\d+\.\d+$/.test(m[2])) loose.push(`${f}: ${m[1]}@${m[2]}`);
      }
    }
    expect(loose).toEqual([]);
  });

  it("نسخة supabase-js في Edge تطابق نسخة التطبيق", () => {
    const lock = JSON.parse(readFileSync(join(__dirname, "../../package-lock.json"), "utf8"));
    const app = lock.packages["node_modules/@supabase/supabase-js"].version as string;
    for (const f of files(ROOT)) {
      for (const m of readFileSync(f, "utf8").matchAll(/"npm:@supabase\/supabase-js@([^"/]+)/g)) {
        expect(m[1], f).toBe(app);
      }
    }
  });
});
