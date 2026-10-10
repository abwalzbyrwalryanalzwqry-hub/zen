import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMON_PASSWORDS, isCommonPassword } from "./common-passwords";
import { passwordRuleError } from "./auth";

const MIGRATION = join(
  __dirname,
  "../../supabase/migrations/20261113100000_audit_phase3_passwords.sql",
);

describe("كلمات المرور الشائعة (3.1)", () => {
  it("القائمة في الواجهة مطابقة حرفياً لقائمة الخادم", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const server = [...sql.matchAll(/^ {2}\('((?:[^']|'')+)'\)[,;]$/gm)].map((m) =>
      m[1].replace(/''/g, "'"),
    );
    expect(server).toEqual([...COMMON_PASSWORDS]);
  });
  it("كلها تحقّق القاعدة الأساسية (وإلا فلا حاجة لها في القائمة) ومكتوبة بأحرف صغيرة", () => {
    for (const p of COMMON_PASSWORDS) {
      expect(p).toBe(p.toLowerCase());
      expect(p.length).toBeGreaterThanOrEqual(8);
    }
  });
  it("المقارنة لا تتأثر بحالة الأحرف، والقاعدة ترفضها", () => {
    expect(isCommonPassword("Password123")).toBe(true);
    expect(isCommonPassword("Tarteel-7319")).toBe(false);
    expect(passwordRuleError("Password123")).toContain("شائعة");
  });
});
