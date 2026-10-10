import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DELETE_ACCOUNT, LEGAL_DOCS, PRIVACY, TERMS } from "@/content/legal";
import { LEGAL_META } from "@/content/legal-meta";
import { RETENTION } from "./maintenance-core";
import { DELETE_CONFIRM_PHRASE } from "./account";

const ROOT = join(__dirname, "../..");

describe("الصفحات القانونية العامة (تدقيق 2.1)", () => {
  it("المولّد يكتب كل صفحة مع بريد التواصل، بلا JavaScript (عدا صفحة التحقق)", () => {
    const out = mkdtempSync(join(tmpdir(), "legal-"));
    execFileSync(
      process.execPath,
      ["scripts/build-legal-site.mjs", "--contact", "help@zen.test", "--out", out],
      {
        cwd: ROOT,
      },
    );
    const files = readdirSync(out).sort();
    expect(files).toEqual([
      ".nojekyll",
      "delete-account.html",
      "index.html",
      "privacy.html",
      "terms.html",
      // صفحة التحقق العام من الشهائد (1.23.0): الوحيدة بسكربت، مبصوم في CSP (public-verify.test.ts).
      "verify",
    ]);
    for (const d of LEGAL_DOCS) {
      const html = readFileSync(join(out, `${d.slug}.html`), "utf8");
      expect(html).toContain('dir="rtl"');
      expect(html).toContain("mailto:help@zen.test");
      expect(html).not.toMatch(/<script|https?:\/\/fonts\./i);
      for (const s of d.sections) expect(html).toContain(s.title);
    }
  });

  it("يرفض التوليد بلا بريد", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ["scripts/build-legal-site.mjs", "--out", join(tmpdir(), "x")],
        {
          cwd: ROOT,
          env: { ...process.env, LEGAL_CONTACT_EMAIL: "" },
          stdio: "pipe",
        },
      ),
    ).toThrow();
  });

  it("النصوص تطابق السلوك: مدة الاحتفاظ وعبارة تأكيد الحذف", () => {
    expect(JSON.stringify(PRIVACY)).toContain(`${RETENTION.audioDays} يوماً`);
    expect(JSON.stringify(DELETE_ACCOUNT)).toContain(DELETE_CONFIRM_PHRASE);
  });
  it("وسوم head (LEGAL_META) تطابق نصوص legal.ts حرفياً", () => {
    expect(LEGAL_META.privacy).toEqual({ title: PRIVACY.title, description: PRIVACY.description });
    expect(LEGAL_META.terms).toEqual({ title: TERMS.title, description: TERMS.description });
  });
});
