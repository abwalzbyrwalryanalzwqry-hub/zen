import { describe, expect, it } from "vitest";
import { ensureCertificatesDict } from "./i18n";
import { isSafeSvg } from "./upload";
import { renderIssued } from "./issued";
import { certificatesReportDoc } from "./report";
import { SYSTEM_TEMPLATES } from "./templates";
import type { CertDetail, CertListItem } from "./api";

ensureCertificatesDict();

describe("isSafeSvg", () => {
  it("accepts plain vector art", () => {
    expect(
      isSafeSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><use href="#a"/><path d="M0 0h10"/></svg>',
      ),
    ).toBe(true);
  });
  it.each([
    "<svg><script>alert(1)</script></svg>",
    '<svg onload="x()"></svg>',
    '<svg><a href="javascript:x()"/></svg>',
    "<svg><foreignObject/></svg>",
    '<svg><image href="https://evil.example/x.png"/></svg>',
    '<svg><image xlink:href="data:x"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x "y">]><svg/>',
    "<svg><style>@import url(x)</style></svg>",
  ])("rejects %s", (s) => expect(isSafeSvg(s)).toBe(false));
});

const detail = (over: Partial<CertDetail> = {}): CertDetail =>
  ({
    id: "11111111-2222-3333-4444-555555555555",
    status: "issued",
    certificate_number: "ZEN-2026-000124",
    verify_code: "CERTAAAAAAAAAB23",
    student_name: "عبدالرحمن الحميري",
    issue_date: "2026-10-07",
    created_at: "2026-10-07T10:00:00Z",
    type_name: "شهادة تقدير",
    design: SYSTEM_TEMPLATES[0].build(),
    assets: [],
    snapshot: {
      vars: {
        student: { fullName: "عبدالرحمن الحميري" },
        certificate: { number: "ZEN-2026-000124", type: "شهادة تقدير", date: "٧ أكتوبر ٢٠٢٦" },
      },
      type: { key: "appreciation", name: "شهادة تقدير", category: "general", text_kind: "x" },
      achievement_ref: {},
      override: false,
    },
    ...over,
  }) as unknown as CertDetail;

describe("renderIssued", () => {
  it("renders from the frozen snapshot with a QR and no void mark", async () => {
    const r = await renderIssued(detail());
    expect(r.html).toContain("عبدالرحمن الحميري");
    expect(r.html).toContain("ZEN-2026-000124");
    expect(r.html).toContain("<svg");
    expect(r.html).not.toContain("cert-void");
    expect(r.link).toContain("CERTAAAAAAAAAB23");
    expect(r.fileBase).toContain("ZEN-2026-000124");
  });
  it("stamps revoked certificates visibly", async () => {
    const r = await renderIssued(detail({ status: "revoked" } as Partial<CertDetail>));
    expect(r.html).toMatch(/class="cert-void">ملغاة?</);
    expect(r.html.endsWith("</div>")).toBe(true);
  });
});

describe("certificatesReportDoc", () => {
  it("builds one row per certificate on the existing export model", () => {
    const items = [
      {
        certificate_number: "ZEN-2026-000001",
        student_name: "أ",
        center_name: "مركز",
        halaqa_name: "حلقة",
        type_name: "نوع",
        template_name: "قالب",
        issue_date: "2026-10-07",
        status: "issued",
      },
      { certificate_number: null, student_name: "ب", status: "revoked" },
    ] as unknown as CertListItem[];
    const doc = certificatesReportDoc(items, null, "مركز النور");
    expect(doc.title).toContain("مركز النور");
    expect(doc.sheets).toHaveLength(1);
    expect(doc.sheets[0].columns).toHaveLength(8);
    expect(doc.sheets[0].rows).toHaveLength(2);
    expect(doc.sheets[0].rows[1][0]).toBe("—");
  });
});

describe("gender-neutral certificate wording", () => {
  it("prints texts that read correctly for male and female students", async () => {
    const ar = (await import("@/locales/certificates/ar.json")).default.certificates;
    // لا بيانات جنس في النظام: نص الشهادة بلا ضمير يعود على الطالب (وفّقه/له/جهوده…)، والسطر الافتتاحي تام بالاسم.
    // 1.26.0: عبارات مساعد الصياغة ونص الإجازة مطبوعة كذلك.
    const phrases = Object.entries(ar.phrase)
      .filter(([k]) => k !== "group" && k !== "title" && k !== "pick")
      .flatMap(([, g]) => Object.values(g as Record<string, string>));
    expect(phrases.length).toBe(24);
    const printed = [
      ar.text.presents,
      ar.text.ijazahBody,
      ar.text.ijazahPresents,
      ...Object.values(ar.typeText),
      ...phrases,
    ];
    for (const s of printed)
      expect(s).not.toMatch(
        /وفّقه|وفقه|يجعله|جعله|فيه|حفظه|جهوده|يجزيه|رحلته|حصوله|\sله\s|بأنّ|لابنك|ابنتك/,
      );
    expect(ar.check.studentReady).not.toMatch(/^الطالب/);
  });
});

describe("signer title presets", () => {
  it("offers masculine, feminine and neutral titles in both locales", async () => {
    const { SIGNER_PRESETS } = await import("@/components/zen/certificates/helpers");
    const ar = (await import("@/locales/certificates/ar.json")).default.certificates.sig;
    for (const k of SIGNER_PRESETS) {
      expect((ar as Record<string, string>)[k]).toBeTruthy();
    }
    expect(ar.teacherF).toBe("معلّمة الحلقة");
  });
  it("defaults the second signature to the neutral «إدارة المركز»", () => {
    for (const st of SYSTEM_TEMPLATES) {
      const labels = st
        .build()
        .elements.filter((e) => e.type === "signature")
        .map((e) => (e as { label: string }).label);
      expect(labels).toContain("إدارة المركز");
    }
  });
});
