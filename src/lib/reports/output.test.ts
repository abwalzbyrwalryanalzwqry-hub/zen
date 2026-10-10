import { describe, expect, it } from "vitest";
import { ensureReportsDict } from "./i18n";
void ensureReportsDict();
import ar from "@/locales/reports/ar.json";
import { fixture } from "./fixture";
import { paginate, type Unit } from "./paginate";
import { coverHtml, esc, pagedHtml, reportCss, summaryCols, tableHtml } from "./render";
import { csvText, exportDocOf } from "./export";
import { ALL_FILTERS, compute } from "./compute";
import { buildDoc, type TableBlock } from "./doc";
import { defaultConfig } from "./config";

const keys = (o: object, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`],
  );

describe("reports dictionary", () => {
  it("has keys", () => {
    expect(keys(ar).length).toBeGreaterThan(10);
  });
});

describe("paginate", () => {
  const H = 1000;
  it("never splits a row and repeats the header on each page", () => {
    const units: Unit[] = [
      {
        kind: "table",
        index: 0,
        headerH: 40,
        emptyH: 30,
        groups: Array.from({ length: 30 }, () => ({ rows: [50] })),
      },
    ];
    const pages = paginate(units, H);
    expect(pages.length).toBe(2);
    const rows = pages.map((p) =>
      p[0].kind === "table" ? p[0].rows.reduce((n, r) => n + r.to - r.from, 0) : 0,
    );
    expect(rows.reduce((a, b) => a + b, 0)).toBe(30);
    expect(rows[0]).toBe(19);
    for (const p of pages) expect(p[0].kind).toBe("table");
  });
  it("keeps a heading with the first group of its table", () => {
    const units: Unit[] = [
      { kind: "block", index: 0, h: 930 },
      { kind: "block", index: 1, h: 30, keepWithNext: true },
      { kind: "table", index: 2, headerH: 40, emptyH: 30, groups: [{ rows: [50] }] },
    ];
    const pages = paginate(units, H);
    expect(pages).toHaveLength(2);
    expect(pages[1].map((p) => p.index)).toEqual([1, 2]);
  });
  it("keeps a student's group together and splits only oversized groups", () => {
    const units: Unit[] = [
      { kind: "block", index: 0, h: 800 },
      {
        kind: "table",
        index: 1,
        headerH: 40,
        emptyH: 30,
        groups: [{ rows: [60, 60, 60] }, { rows: Array(25).fill(50) }],
      },
    ];
    const pages = paginate(units, H);
    const t1 = pages[1][0];
    expect(t1.kind === "table" && t1.rows[0]).toEqual({ group: 0, from: 0, to: 3 });
    expect(pages.length).toBe(3);
    expect(pages.every((p) => p.length > 0)).toBe(true);
  });
  it("honors explicit page breaks without empty pages", () => {
    const pages = paginate(
      [
        { kind: "block", index: 0, h: 100, breakBefore: true },
        { kind: "block", index: 1, h: 100, breakBefore: true },
      ],
      H,
    );
    expect(pages).toHaveLength(2);
  });
});

describe("render", () => {
  const cfg = { ...defaultConfig("2026-09-10"), from: "2026-09-01", to: "2026-09-10" };
  const doc = buildDoc(compute(fixture(), ALL_FILTERS), cfg);
  it("escapes HTML and merges the name cell across a group's rows", () => {
    expect(esc('<b a="1">')).toBe("&lt;b a=&quot;1&quot;&gt;");
    const t: TableBlock = {
      type: "table",
      columns: [
        { label: "a", w: 50 },
        { label: "b", w: 50 },
      ],
      groups: [
        [
          [{ text: "x", span: true }, { text: "1" }],
          [{ text: "x", span: true }, { text: "2" }],
        ],
      ],
      empty: "-",
    };
    expect(tableHtml(t)).toContain('rowspan="2"');
    expect(tableHtml(t, [{ group: 0, from: 1, to: 2 }])).not.toContain("rowspan");
  });
  it("produces real RTL A4 pages with page numbers and UI font weights", () => {
    const css = reportCss(cfg, false, "");
    const html = pagedHtml(doc, cfg, css, [
      [{ kind: "block", index: -1 }],
      [{ kind: "block", index: 0 }],
    ]);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("size: A4 portrait");
    expect(html).toContain("الصفحة ١ من ٢");
    expect(html).toContain("الصفحة ٢ من ٢");
    expect(html).toContain("تم التوليد بواسطة تطبيق زن");
    expect(css).toContain('"Zen Text"');
    for (const w of [300, 400, 500, 900]) expect(css).toContain(`font-weight: ${w}`);
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(html).not.toContain("<script");
  });
});

describe("layout fixes (1.15.0)", () => {
  const cfg = { ...defaultConfig("2026-09-10"), from: "2026-09-01", to: "2026-09-10" };
  it("never leaves a single summary card on the last row", () => {
    for (let n = 2; n <= 12; n++) {
      const c = summaryCols(n);
      expect(n % c === 0 || n % c >= 2, `n=${n} cols=${c}`).toBe(true);
    }
    expect(summaryCols(9)).toBe(3);
    expect(summaryCols(8)).toBe(4);
  });
  it("styles only direct summary cells (no nested borders)", () => {
    const css = reportCss(cfg, false, "");
    expect(css).toContain(".summary > div");
    expect(css).not.toMatch(/\.summary div\s*\{/);
  });
  it("shows the logo and center once on the first page", () => {
    const doc = buildDoc(compute(fixture(), ALL_FILTERS), cfg);
    const cover = coverHtml(doc, cfg);
    expect(cover).not.toContain('class="logo');
    expect(cover).not.toContain('class="filters"');
    const noHeader = { ...cfg, header: { ...cfg.header, show: false } };
    expect(coverHtml(doc, noHeader)).toContain('class="logo');
    const html = pagedHtml(doc, cfg, "", [
      [{ kind: "block", index: -1 }],
      [{ kind: "block", index: 0 }],
    ]);
    const [p1, p2] = html.split('<section class="page"').slice(1);
    expect(p1).not.toContain('class="hs"');
    expect(p2).toContain('class="hs"');
  });
  it("puts previous-period numbers inside summary cards", () => {
    const c = compute(fixture(), ALL_FILTERS, fixture());
    const doc = buildDoc(c, cfg);
    const sum = doc.blocks.find((b) => b.type === "summary");
    expect(
      sum && sum.type === "summary" && sum.items.some((i) => i.delta?.text.includes("من")),
    ).toBe(true);
  });
  it("keeps surah and ayah together", () => {
    const doc = buildDoc(compute(fixture(), ALL_FILTERS), { ...cfg, template: "detailed" });
    expect(JSON.stringify(doc.blocks)).toMatch(/[\u0600-\u06FF]\u00a0[٠-٩]/);
  });
});

describe("export", () => {
  const cfg = { ...defaultConfig("2026-09-10"), from: "2026-09-01", to: "2026-09-10" };
  const c = compute(fixture(), ALL_FILTERS);
  const doc = buildDoc(c, cfg);
  it("builds organized Excel sheets with numeric cells", () => {
    const x = exportDocOf(
      c,
      { ...cfg, records: ["attendance", "memorize", "review", "achievement"] },
      doc,
    );
    expect(x.sheets.map((s) => s.title)).toEqual([
      "الحضور والغياب",
      "الحفظ",
      "المراجعة",
      "الإنجاز",
    ]);
    const att = x.sheets[0];
    expect(att.rows[2][0]).toBe("موسى محمد عبدالرؤوف");
    expect(att.rows[2][4]).toBe(5);
  });
  it("writes UTF-8 CSV with BOM and quoted Arabic text", () => {
    const csv = csvText(c);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("عبدالرحمن أحمد نعمان");
    expect(csv).toContain("النبإ 1");
    expect(csv.split("\r\n").length).toBe(32);
  });
});

describe("document content (1.15.0)", () => {
  const base = { ...defaultConfig("2026-09-10"), from: "2026-09-01", to: "2026-09-10" };
  const c = compute(fixture(), ALL_FILTERS);
  it("adds a parent summary and teacher/guardian signatures to the official student report", () => {
    const doc = buildDoc(c, { ...base, kind: "student", records: ["attendance", "memorize"] });
    const paras = doc.blocks
      .filter((b) => b.type === "para")
      .map((b) => (b as { text: string }).text);
    expect(paras.some((p) => p.startsWith("ملخص لولي الأمر عن"))).toBe(true);
    const signs = doc.blocks.filter((b) => b.type === "sign");
    expect(signs).toHaveLength(c.students.length);
    expect(signs[0]).toEqual({ type: "sign", labels: ["توقيع المعلّم", "توقيع ولي الأمر"] });
    const brief = buildDoc(c, { ...base, kind: "student", template: "brief" });
    expect(brief.blocks.some((b) => b.type === "sign")).toBe(false);
  });
  it("ends the official halaqa report with a stamp and marks follow-up names", () => {
    const doc = buildDoc(c, { ...base, kind: "halaqa" });
    expect(doc.blocks.at(-1)).toEqual({ type: "sign", labels: ["توقيع المعلّم", "ختم المركز"] });
    const flagged = c.students.filter((x) => x.stats.followUp.length).length;
    const att = doc.blocks.find((b) => b.type === "table") as TableBlock;
    expect(att.groups.filter((g) => g[0][0].flag).length).toBe(flagged);
    if (flagged) {
      expect(tableHtml(att)).toContain('class="fl"');
      expect(doc.blocks.some((b) => b.type === "para" && b.text.startsWith("العلامة ●"))).toBe(
        true,
      );
    }
  });
});
