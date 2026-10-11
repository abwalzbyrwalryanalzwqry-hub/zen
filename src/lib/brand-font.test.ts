/**
 * حارس P0-03 (تدقيق أكتوبر 2026): خط الواجهة البديل مرخّص ومعروض في «المصادر» مع نص رخصته.
 * يُسمح بنظام خطوط ثمانية داخل Android فقط عبر الملفات المحددة أدناه.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UI_FONT_FAMILY } from "./brand-font";
import { FONT_FAMILY, defaultFont } from "./certificates/model";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const THMANYAH_ALLOWED_FILES = new Set([
  join("src", "lib", "thmanyah-fonts.ts"),
  join("src", "router.tsx"),
  join("src", "routes", "__root.tsx"),
  join("src", "styles.css"),
]);

describe("خط الواجهة (P0-03)", () => {
  it("ملفات «ثمانية» محصورة في محمّل Android المصرّح به", () => {
    const files = [...walk("src"), ...walk("public")];
    expect(files.filter((f) => /thmanyah/i.test(f))).toEqual([
      join("src", "lib", "thmanyah-fonts.ts"),
    ]);
  });

  it("لا مرجع لـ Thmanyah خارج نظام خطوط Android المصرّح به", () => {
    const offenders = walk("src")
      .filter((f) => /\.(ts|tsx|css|json)$/.test(f) && !f.endsWith("brand-font.test.ts"))
      .filter((f) => !THMANYAH_ALLOWED_FILES.has(f))
      .filter((f) => {
        const s = readFileSync(f, "utf8");
        return /thmanyah/i.test(s.replace(/تحمل "Thmanyah"/g, ""));
      });
    expect(offenders).toEqual([]);
  });

  it("ملف الخط ورخصته موجودان", () => {
    for (const f of ["src/assets/fonts/markazi-text.woff2", "public/fonts/OFL-MarkaziText.txt"])
      expect(existsSync(f), f).toBe(true);
    expect(readFileSync("public/fonts/OFL-MarkaziText.txt", "utf8")).toMatch(
      /SIL OPEN FONT LICENSE/i,
    );
  });

  it("التصاميم المحفوظة بخط «ثمانية» تُرحَّل إلى خط الواجهة عند القراءة", () => {
    expect(FONT_FAMILY).toBe(UI_FONT_FAMILY);
    expect(defaultFont({ family: "Thmanyah", weight: 900 }).family).toBe(UI_FONT_FAMILY);
    expect(defaultFont({ family: "Thmanyah", weight: 900 }).weight).toBe(900);
  });

  it("styles.css يعلن الاسم المستعار بملف الخط", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain('font-family: "Zen Text"');
    expect(css).toContain("markazi-text.woff2");
  });
});
