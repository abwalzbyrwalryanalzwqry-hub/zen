import { describe, expect, it } from "vitest";
import { normalizeDesign, safePalette, scrubDesign, DEFAULT_PALETTE } from "./model";
import { renderIssued } from "./issued";
import { SYSTEM_TEMPLATES } from "./templates";
import { ensureCertificatesDict } from "./i18n";
import type { CertDetail } from "./api";

ensureCertificatesDict();

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- تصميم مُعدّ عمداً بأنواع خاطئة
type Loose = Record<string, any>;

/** C1 (فحص الاستوديو، 1.22.0): تصميم مُعدّ يُرسل للخادم مباشرة لا يحقن وسماً ولا معالج حدث في الرسم. */
const EVIL = '"><img src=x onerror=alert(1)><b x="';
const detail = (design: unknown): CertDetail =>
  ({
    id: "1",
    status: "issued",
    certificate_number: "ZEN-2026-000001",
    verify_code: "CERTAAAAAAAAAB23",
    student_name: "<b>طالب</b>",
    issue_date: "2026-10-07",
    created_at: "",
    type_name: "t",
    design,
    assets: [],
    snapshot: { vars: {}, type: {}, achievement_ref: {}, override: false },
  }) as unknown as CertDetail;

describe("سلامة التصميم", () => {
  it("كل حقل ذي قيمة مغلقة أو لون يُنظَّف قبل الرسم", async () => {
    const d = SYSTEM_TEMPLATES[0].build() as unknown as Loose;
    for (const e of d.elements) {
      e.id = `x${EVIL}`;
      e.groupId = EVIL;
      if (e.font) Object.assign(e.font, { dir: EVIL, align: EVIL, color: EVIL });
      Object.assign(e, {
        fit: EVIL,
        dash: EVIL,
        color: EVIL,
        color2: EVIL,
        fill: EVIL,
        stroke: EVIL,
      });
      if (e.type === "image") e.src = `asset:${EVIL}`;
    }
    d.palette = { primary: `red;}</style><script>alert(2)</script>`, accent: EVIL };
    d.page.background = EVIL;
    d.page.backgroundFit = EVIL;
    d[`on${EVIL}`] = 1;
    const r = await renderIssued(detail(d));
    expect(r.html).not.toMatch(/onerror|<script|<img src=x|alert\(/);
  });
  it("النصوص الحرة تبقى وتُهرَّب", async () => {
    const d = SYSTEM_TEMPLATES[0].build() as unknown as Loose;
    const t = d.elements.find((e: { type: string }) => e.type === "text");
    t.text = EVIL;
    const n = normalizeDesign(d);
    expect(n.elements.find((e) => e.id === t.id)).toMatchObject({ text: EVIL });
    const r = await renderIssued(detail(d));
    expect(r.html).not.toContain("<img src=x");
    expect(r.html).toContain("&lt;img src=x");
  });
  it("الألوان والمراجع السليمة لا تتغيّر", () => {
    for (const tpl of SYSTEM_TEMPLATES) {
      const d = tpl.build();
      expect(scrubDesign(d)).toEqual(JSON.parse(JSON.stringify(d)));
    }
    expect(
      scrubDesign({ src: "asset:11111111-2222-3333-4444-555555555555", c: "rgba(1, 2, 3, .5)" }),
    ).toEqual({
      src: "asset:11111111-2222-3333-4444-555555555555",
      c: "rgba(1, 2, 3, .5)",
    });
    expect(safePalette({ primary: "#123456", accent: "url(x)" })).toEqual({
      ...DEFAULT_PALETTE,
      primary: "#123456",
    });
  });
});
