import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { verifyLinkFor } from "./qr";
import { parseVerifyCode } from "@/lib/achievements/verify";
// @ts-expect-error — وحدة Node بلا أنواع (scripts/)
import { verifyPage } from "../../../scripts/verify-page.mjs";

/** H1 (فحص الاستوديو، 1.23.0): رابط QR العام وصفحة التحقق الثابتة. */
const CODE = "ABCDEFGHJKLMNPQR";

describe("التحقق العام", () => {
  it("رابط https حين يُضبط، وإلا zen://، والماسح يقرأ الاثنين", () => {
    const pub = verifyLinkFor(CODE, "https://owner.github.io/zen-legal/verify/");
    expect(pub).toBe(`https://owner.github.io/zen-legal/verify/?code=${CODE}`);
    expect(verifyLinkFor(CODE, "https://x.org/verify")).toBe(`https://x.org/verify/?code=${CODE}`);
    expect(verifyLinkFor(CODE, "")).toBe(`zen://verify?code=${CODE}`);
    expect(verifyLinkFor(CODE, "javascript:alert(1)")).toBe(`zen://verify?code=${CODE}`);
    expect(verifyLinkFor(CODE, "http://insecure.org/verify/")).toBe(`zen://verify?code=${CODE}`);
    expect(parseVerifyCode(pub)).toBe(CODE);
    expect(parseVerifyCode(verifyLinkFor(CODE, null))).toBe(CODE);
  });
  it("الصفحة: سكربت واحد مبصوم في CSP، والاتصال بخادم Supabase وحده، ولا innerHTML", () => {
    const html: string = verifyPage({
      url: "https://abc.supabase.co",
      key: "pk_test",
      contact: "a@b.co",
    });
    const js = /<script>([\s\S]*)<\/script>/.exec(html)![1];
    const hash = createHash("sha256").update(js).digest("base64");
    expect(html).toContain(`script-src 'sha256-${hash}'`);
    expect(html).toContain("connect-src https://abc.supabase.co;");
    expect(html).toContain("verify_certificate_public");
    expect(js).not.toMatch(/innerHTML|eval\(|document\.write/);
    expect(html.match(/<script/g)).toHaveLength(1);
  });
});
