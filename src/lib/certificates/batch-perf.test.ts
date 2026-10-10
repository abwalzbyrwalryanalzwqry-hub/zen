import { describe, expect, it } from "vitest";
import { ensureCertificatesDict } from "./i18n";
import { mapLimit, renderIssued } from "./issued";
import { SYSTEM_TEMPLATES } from "./templates";
import type { CertDetail } from "./api";

ensureCertificatesDict();

/**
 * قياس توليد دفعة من 30 شهادة (خطة التطوير، المرحلة 0: «توليد 30 شهادة»): التركيب من اللقطة المجمّدة ورمز
 * التحقق لكل شهادة بالتوازي المحدود نفسه الذي يستعمله التصدير الجماعي. الحد سخيّ (لا يقيس جهازاً ضعيفاً)
 * ويُسجَّل الزمن في مخرجات CI؛ القياس على جهاز حقيقي في docs/PERFORMANCE.md.
 */
const detail = (i: number): CertDetail =>
  ({
    id: `11111111-2222-3333-4444-${String(i).padStart(12, "0")}`,
    status: "issued",
    certificate_number: `ZEN-2026-${String(i).padStart(6, "0")}`,
    verify_code: `CERT${String(i).padStart(12, "A")}`,
    student_name: `طالب رقم ${i}`,
    issue_date: "2026-10-07",
    created_at: "2026-10-07T10:00:00Z",
    type_name: "شهادة تقدير",
    design: SYSTEM_TEMPLATES[i % SYSTEM_TEMPLATES.length].build(),
    assets: [],
    snapshot: {
      vars: {
        student: { fullName: `طالب رقم ${i}` },
        certificate: { number: `ZEN-2026-${i}`, type: "شهادة تقدير", date: "٧ أكتوبر ٢٠٢٦" },
      },
      type: { key: "appreciation", name: "شهادة تقدير", category: "general", text_kind: "x" },
      achievement_ref: {},
      override: false,
    },
  }) as unknown as CertDetail;

describe("أداء دفعة الشهائد", () => {
  it("30 شهادة بقوالب النظام تُركَّب في أقل من 5 ثوانٍ", async () => {
    const items = Array.from({ length: 30 }, (_, i) => detail(i + 1));
    const t0 = performance.now();
    const pages = await mapLimit(items, 4, (d) => renderIssued(d));
    const ms = Math.round(performance.now() - t0);
    console.log(`PERF certificates30 ${ms}ms`);
    expect(pages).toHaveLength(30);
    expect(new Set(pages.map((p) => p.fileBase)).size).toBe(30);
    expect(pages.every((p) => p.html.includes("<svg"))).toBe(true);
    expect(ms).toBeLessThan(5000);
  });
});
