import { describe, expect, it } from "vitest";
import { ensureCertificatesDict } from "./i18n";
void ensureCertificatesDict();
import ar from "@/locales/certificates/ar.json";
import {
  make,
  normalizeDesign,
  defaultPage,
  DEFAULT_PALETTE,
  DEFAULT_NUMBERS,
  type Design,
} from "./model";
import {
  resolveText,
  serverPreviewVars,
  mergeVars,
  achievementVarsOnly,
  VARIABLES,
  tokensOf,
} from "./variables";
import { renderPage, printDocument, displayVars } from "./render";
import { fitDesign, estimateMeasurer } from "./fit";
import { SYSTEM_TEMPLATES } from "./templates";
import { editorReducer, initEditor } from "./editor";
import { brandRefs, freezeBrand, hasBrandRefs } from "./brand";
import { checkCertificate, outsidePage } from "./validate";
import { certificateFileBase } from "./export";
import { verifyLink, verifyPath } from "./qr";
import { composePage, neededAssetIds } from "./compose";
import { certErrorCode } from "./api";

const keys = (o: object, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`],
  );

const design = (els: Design["elements"], o: Partial<Design["page"]> = {}): Design => ({
  v: 1,
  page: { ...defaultPage("A4", "landscape"), ...o },
  palette: { ...DEFAULT_PALETTE },
  numbers: { ...DEFAULT_NUMBERS },
  elements: els,
});

const vars = serverPreviewVars({
  studentId: "11111111-2222-3333-4444-555555555555",
  studentName: "عبدالله أحمد",
  centerName: "مركز النور",
  circleName: "حلقة الفجر",
  teacherName: "أ. محمد",
  issueDate: "2026-10-07",
  typeName: "شهادة حفظ",
  number: "ZEN-2026-000124",
  verifyCode: "ABCD1234",
});

describe("certificates dictionary", () => {
  it("has no empty keys", () => {
    expect(keys(ar).length).toBeGreaterThan(10);
  });
  it("has the exact required Arabic messages", () => {
    expect(ar.certificates.check.unreadableVar).toBe("يوجد متغير غير قابل للقراءة.");
    expect(ar.certificates.err.generic).toBe("تعذر إنشاء الشهادة حاليًا.");
    expect(ar.certificates.empty.templates).toBe("لا توجد قوالب بعد.");
    expect(ar.certificates.empty.createTemplate).toBe("إنشاء قالب");
    expect(ar.certificates.empty.issued).toBe("لم يتم إصدار أي شهادات بعد.");
    expect(Object.values(ar.certificates.steps)).toEqual([
      "جارٍ تجهيز الشهادة...",
      "معالجة البيانات...",
      "تطبيق التصميم...",
      "تجهيز الملف...",
      "اكتمل.",
    ]);
  });
  it("names every registered variable", () => {
    for (const v of VARIABLES) expect(keys(ar)).toContain(`certificates.var.${v.key}`);
  });
});

describe("variables", () => {
  it("resolves every required variable", () => {
    for (const k of [
      "student.name",
      "student.fullName",
      "student.id",
      "center.name",
      "circle.name",
      "teacher.name",
      "certificate.date",
      "certificate.number",
    ])
      expect(resolveText(`{{${k}}}`, vars).missing).toEqual([]);
  });
  it("reports missing and unknown variables instead of printing them", () => {
    const r = resolveText("{{achievement.title}} {{nope.x}}", vars);
    expect(r.missing).toContain("achievement.title");
    expect(r.unknown).toContain("nope.x");
    expect(r.text).not.toContain("{{");
  });
  it("server values win over client values", () => {
    const m = mergeVars({ student: { name: "مزوّر" } }, vars);
    expect(m.student?.name).toBe("عبدالله أحمد");
    expect(achievementVarsOnly({ student: { name: "x" }, achievement: { title: "t" } })).toEqual({
      achievement: { title: "t" },
    });
  });
  it("finds tokens", () => {
    expect(tokensOf("أ {{a.b}} ب {{ c.d }}")).toEqual(["a.b", "c.d"]);
  });
});

describe("render", () => {
  it("renders RTL Arabic text without truncation and escapes HTML", () => {
    const d = design([make.text({ text: "{{student.name}} <b>", w: 200, h: 20 })]);
    const r = renderPage(d, { vars, assets: {}, uid: "t" });
    expect(r.html).toContain("عبدالله أحمد");
    expect(r.html).toContain("&lt;b&gt;");
    expect(r.html).toContain('dir="rtl"');
    expect(r.html).not.toContain("…");
  });
  it("uses Arabic-Indic digits for dates and numbers when chosen", () => {
    const d = design([make.text({ text: "{{certificate.date}}" })]);
    const shown = displayVars(vars, d);
    expect(String(shown.certificate?.date)).toMatch(/[٠-٩]/);
    d.numbers.digits = "latn";
    expect(String(displayVars(vars, d).certificate?.date)).toMatch(/2026/);
  });
  it("keeps every inline style attribute intact (no raw double quotes inside style)", () => {
    for (const st of SYSTEM_TEMPLATES) {
      const r = renderPage(st.build(), { vars: {}, assets: {}, uid: "q" });
      // اقتباس مزدوج داخل style="…" يقطع السمة فيضيع حجم الخط ولونه ومحاذاته.
      expect(r.html).not.toMatch(/style="[^"]*"[^\s>/]/);
    }
  });

  it("does not style the QR wrapper with the inner box padding", () => {
    // غلاف العنصر يحمل ce-qr؛ لو حمل الصندوق الداخلي الصنف نفسه لأخذ الغلاف حشوة 4% فكبر عن مقاسه.
    expect(printDocument(["x"], { width: 297, height: 210 }, "", "t")).not.toMatch(/\.ce-qr\{/);
  });

  it("only uses the UI font (Zen Text)", () => {
    for (const s of SYSTEM_TEMPLATES) {
      const r = renderPage(s.build(), { vars, assets: {}, uid: s.key, pending: true });
      const fams = [...r.html.matchAll(/font-family:([^;"]+)/g)].map((m) => m[1]);
      for (const f of fams) expect(f).toMatch(/Zen Text/);
    }
  });
  it("print document has one exact @page size and no trailing blank page", () => {
    const pg = renderPage(design([]), { vars, assets: {}, uid: "a" }).html;
    const doc = printDocument([pg, pg], { width: 297, height: 210 }, "", "x");
    expect(doc.match(/@page/g)).toHaveLength(1);
    expect(doc).toContain("size:297mm 210mm");
    expect(doc.match(/<section/g)).toHaveLength(2);
    expect(doc).toMatch(
      /break-after:auto;page-break-after:auto"><div class="cert-page"[^]*<\/section><\/body>/,
    );
  });
});

describe("auto fit", () => {
  const nameEl = () =>
    make.text({
      id: "n",
      text: "{{student.name}}",
      w: 120,
      h: 18,
      font: { size: 34 } as never,
      autoFit: { enabled: true, min: 14 },
    });
  it("shrinks long and hamza names instead of truncating", () => {
    const long = mergeVars(vars, {
      student: { name: "عبدالرحمن بن إسماعيل بن مؤمن آل الأحمديّ الهاشميّ القرشيّ" },
    });
    const f = fitDesign(design([nameEl()]), long, estimateMeasurer);
    expect(f.overflow).toEqual([]);
    expect(f.fitted.n).toBeLessThan(34);
    expect(f.fitted.n).toBeGreaterThanOrEqual(14);
  });
  it("flags text that cannot fit even at minimum", () => {
    const huge = mergeVars(vars, { student: { name: "اسم ".repeat(80) } });
    expect(fitDesign(design([nameEl()]), huge, estimateMeasurer).overflow).toEqual(["n"]);
  });
});

describe("system templates", () => {
  it("has the eight premium templates and the ijazah", () => {
    expect(SYSTEM_TEMPLATES.map((s) => s.key).sort()).toEqual(
      [
        "classic_quran",
        "ijazah_classic",
        "elegant_minimal",
        "modern_achievement",
        "official_center",
        "premium_gold",
        "quran_completion",
        "royal_islamic",
        "student_excellence",
      ].sort(),
    );
  });
  it("every template is valid, inside the page, and fits a typical name", () => {
    for (const s of SYSTEM_TEMPLATES) {
      const d = s.build();
      expect(normalizeDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
      expect(outsidePage(d).outside, s.key).toEqual([]);
      const all = mergeVars(vars, {
        achievement: {
          title: "إتمام الجزء الثلاثين",
          description: "نظير إتمام حفظ الجزء",
          type: "حفظ",
          amount: "20 صفحة",
        },
      });
      expect(fitDesign(freezeBrand(d, null, {}), all, estimateMeasurer).overflow, s.key).toEqual(
        [],
      );
      expect(
        d.elements.some((e) => e.type === "qr"),
        s.key,
      ).toBe(true);
    }
  });
});

describe("editor", () => {
  const a = make.text({ id: "a", x: 10, y: 10, w: 20, h: 10 });
  const b = make.text({ id: "b", x: 50, y: 30, w: 20, h: 10 });
  const c = make.text({ id: "c", x: 120, y: 60, w: 20, h: 10 });
  it("undo/redo restores exact states", () => {
    let s = initEditor(design([a]));
    s = editorReducer(s, { type: "move", ids: ["a"], dx: 5, dy: 0 });
    s = editorReducer(s, { type: "move", ids: ["a"], dx: 5, dy: 0, merge: true });
    expect(s.design.elements[0].x).toBe(20);
    s = editorReducer(s, { type: "undo" });
    expect(s.design.elements[0].x).toBe(10);
    s = editorReducer(s, { type: "redo" });
    expect(s.design.elements[0].x).toBe(20);
  });
  it("copy/paste/duplicate create new ids; locked elements don't move or delete", () => {
    let s = initEditor(design([a, { ...b, locked: true }]));
    s = editorReducer(s, { type: "copy", ids: ["a"] });
    s = editorReducer(s, { type: "paste" });
    s = editorReducer(s, { type: "duplicate", ids: ["a"] });
    const ids = s.design.elements.map((e) => e.id);
    expect(new Set(ids).size).toBe(4);
    s = editorReducer(s, { type: "move", ids: ["b"], dx: 9, dy: 9 });
    s = editorReducer(s, { type: "remove", ids: ["b"] });
    expect(s.design.elements.find((e) => e.id === "b")?.x).toBe(50);
  });
  it("aligns, distributes, groups and orders", () => {
    let s = initEditor(design([a, b, c]));
    s = editorReducer(s, { type: "align", ids: ["a"], align: "hcenter" });
    expect(s.design.elements[0].x).toBeCloseTo((297 - 20) / 2);
    s = editorReducer(s, { type: "distribute", ids: ["a", "b", "c"], axis: "v" });
    const ys = s.design.elements.map((e) => e.y);
    expect(ys[1] - ys[0]).toBeCloseTo(ys[2] - ys[1]);
    s = editorReducer(s, { type: "group", ids: ["a", "b"] });
    s = editorReducer(s, { type: "select", ids: ["a"] });
    expect(s.selection.sort()).toEqual(["a", "b"]);
    s = editorReducer(s, { type: "order", ids: ["c"], to: "back" });
    expect(s.design.elements[0].id).toBe("c");
  });
});

describe("brand freeze", () => {
  it("resolves brand refs to assets and fills signer names", () => {
    const d = design([
      make.image({ id: "l", src: "brand:logo" }),
      make.signature({ id: "s", src: "brand:signature:director" }),
    ]);
    const brand = {
      logo: "L1",
      signatures: { director: "D1" },
      signers: { director: { name: "د. خالد", title: "مدير المركز" } },
    };
    const refs = brandRefs(brand, null);
    const f = freezeBrand(d, brand, refs);
    expect(hasBrandRefs(f)).toBe(false);
    expect(f.elements[0]).toMatchObject({ src: "asset:L1" });
    expect(f.elements[1]).toMatchObject({
      src: "asset:D1",
      signer: "د. خالد",
      label: "مدير المركز",
    });
    expect(neededAssetIds(d, refs).sort()).toEqual(["D1", "L1"]);
    expect(hasBrandRefs(d)).toBe(true);
  });
});

describe("validate", () => {
  const base = {
    studentInHalaqa: true,
    hasCenter: true,
    hasHalaqa: true,
    hasTemplate: true,
    eligibility: null,
    override: false,
    fontsReady: true,
    qrOk: true,
  };
  it("blocks on unreadable variables with the exact message", () => {
    const d = design([
      make.text({ id: "x", text: "{{achievement.title}}" }),
      make.qr({ x: 250, y: 160 }),
    ]);
    const c = composePage(
      d,
      vars,
      { assets: {}, brand: null, refs: {} },
      { uid: "v", measure: estimateMeasurer },
    );
    const r = checkCertificate({
      design: c.design,
      issues: c.issues,
      overflow: c.overflow,
      ...base,
    });
    expect(r.ok).toBe(false);
    expect(r.items.find((i) => i.key === "vars")?.text).toContain("يوجد متغير غير قابل للقراءة.");
  });
  it("blocks elements outside the page and missing required images", () => {
    const d = design([
      make.text({ id: "o", x: 290, w: 40 }),
      make.image({ id: "i", required: true, src: "brand:logo" }),
    ]);
    const c = composePage(d, vars, { assets: {}, brand: null, refs: {} }, { uid: "v" });
    const r = checkCertificate({ design: c.design, issues: c.issues, overflow: [], ...base });
    expect(r.items.filter((i) => i.level === "error").map((i) => i.key)).toEqual(
      expect.arrayContaining(["outside", "image"]),
    );
  });
  it("passes a complete system template", () => {
    const d = SYSTEM_TEMPLATES[0].build();
    const all = mergeVars(vars, {
      achievement: { title: "إتمام الجزء", description: "نص", type: "حفظ", amount: "5" },
      memorization: { total: "1" },
    });
    const c = composePage(
      d,
      all,
      { assets: {}, brand: null, refs: {} },
      { uid: "v", measure: estimateMeasurer },
    );
    const r = checkCertificate({
      design: c.design,
      issues: c.issues,
      overflow: c.overflow,
      ...base,
    });
    expect(r.items.filter((i) => i.level === "error")).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe("batch isolation", () => {
  it("30 students each get their own name, number and QR target", () => {
    const d = SYSTEM_TEMPLATES[1].build();
    const pages = Array.from({ length: 30 }, (_, i) => {
      const v = mergeVars(vars, {
        student: { name: `طالب رقم ${i + 1}`, fullName: `طالب رقم ${i + 1}`, id: `S${i}` },
        certificate: {
          number: `ZEN-2026-${String(i + 1).padStart(6, "0")}`,
          verifyCode: `CODE${i}`,
        },
        achievement: { title: "ت", description: "و", type: "ن", amount: "1" },
      });
      return renderPage(freezeBrand(d, null, {}), {
        vars: v,
        assets: {},
        uid: `b${i}`,
        qrSvg: `<svg data-q="CODE${i}"/>`,
      }).html;
    });
    pages.forEach((p, i) => {
      expect(p).toContain(`طالب رقم ${i + 1}<`.replace("<", ""));
      expect(p).toContain(`CODE${i}"`);
      for (const j of [i - 1, i + 1]) if (j >= 0 && j < 30) expect(p).not.toContain(`CODE${j}"`);
    });
    const doc = printDocument(pages, d.page, "", "batch");
    expect(doc.match(/<section/g)).toHaveLength(30);
  });
});

describe("qr, files and errors", () => {
  it("builds verification links", () => {
    expect(verifyLink("AB12")).toBe("zen://verify?code=AB12");
    expect(verifyPath("AB 12")).toBe("/verify?code=AB%2012");
  });
  it("organized safe file names", () => {
    expect(certificateFileBase("عبدُالله أحمد", "ZEN-2026-000124")).toBe(
      "certificate-عبدالله-أحمد-ZEN-2026-000124",
    );
    expect(certificateFileBase("a/b", "2026")).not.toContain("/");
  });
  it("maps server error codes", () => {
    expect(certErrorCode({ message: "NOT_YOUR_HALAQA" })).toBe("NOT_YOUR_HALAQA");
    expect(certErrorCode(new Error("boom"))).toBe("generic");
  });
});

import { pickTemplate, parsePick, pickKey } from "./resolve";
describe("template priority Type → Circle → Center → System", () => {
  const row = (
    id: string,
    halaqa_id: string | null,
    type_key: string | null,
    archived = false,
  ) => ({
    id,
    halaqa_id,
    type_key,
    archived,
    updated_at: "2026-01-01",
  });
  const rows = [
    row("center", null, null),
    row("circle", "H1", null),
    row("typeAll", null, "juz_complete"),
    row("typeH1", "H1", "juz_complete"),
  ];
  it("prefers the most specific template", () => {
    expect(pickTemplate(rows, { typeKey: "juz_complete", halaqaId: "H1" })).toEqual({
      kind: "center",
      id: "typeH1",
    });
    expect(pickTemplate(rows, { typeKey: "juz_complete", halaqaId: "H2" })).toEqual({
      kind: "center",
      id: "typeAll",
    });
    expect(pickTemplate(rows, { typeKey: "attendance", halaqaId: "H1" })).toEqual({
      kind: "center",
      id: "circle",
    });
    expect(pickTemplate(rows, { typeKey: "attendance", halaqaId: "H2" })).toEqual({
      kind: "center",
      id: "center",
    });
    expect(pickTemplate([], { typeKey: "quran_complete", halaqaId: null }).kind).toBe("system");
    expect(pickTemplate([row("x", null, null, true)], { typeKey: null, halaqaId: null }).kind).toBe(
      "system",
    );
  });
  it("round-trips pick keys", () => {
    expect(parsePick(pickKey({ kind: "system", key: "royal_islamic" }))).toEqual({
      kind: "system",
      key: "royal_islamic",
    });
    expect(parsePick("s:nope")).toBeNull();
  });
});
