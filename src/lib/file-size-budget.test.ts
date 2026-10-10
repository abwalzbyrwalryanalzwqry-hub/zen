import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ميزانية حجم الملفات (تدقيق أكتوبر 2026، المرحلة 3.5). الملف فوق 500 سطر يصعب مراجعته واختباره؛ الملفات
 * الحالية الأكبر مجمَّدة عند حجمها (لا تكبر)، وتُقسَّم عند لمسها لميزة جديدة. ملف جديد فوق الحد يفشل هنا.
 * عند تقسيم ملف من القائمة: احذفه منها أو أنزل رقمه (القاعدة 55).
 */
const LIMIT = 500;
// M5 (أكتوبر 2026): قُسِّمت كل الملفات المجمَّدة فصارت القائمة فارغة؛ لا يُضاف إليها ملف جديد.
const FROZEN: Record<string, number> = {};

const ROOT = join(__dirname, "../..");
const SKIP = /\.test\.|routeTree\.gen|integrations\/supabase\/types|functions\/_shared\//;

describe("ميزانية حجم الملفات", () => {
  it(`لا ملف مصدر فوق ${LIMIT} سطر إلا المجمَّد، ولا يكبر المجمَّد`, () => {
    const files = execFileSync(
      "git",
      ["ls-files", "-co", "--exclude-standard", "src", "supabase/functions"],
      {
        cwd: ROOT,
        encoding: "utf8",
      },
    )
      .split("\n")
      .filter((f) => /\.(ts|tsx)$/.test(f) && !SKIP.test(f));
    const over: string[] = [];
    for (const f of files) {
      let n: number;
      try {
        n = readFileSync(join(ROOT, f), "utf8").split("\n").length;
      } catch {
        continue; // محذوف في شجرة العمل
      }
      const cap = FROZEN[f] ?? LIMIT;
      if (n > cap) over.push(`${f}: ${n} > ${cap}`);
    }
    expect(over).toEqual([]);
  });
});
