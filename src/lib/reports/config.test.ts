import { describe, expect, it } from "vitest";
import { defaultConfig, KIND_SECTIONS, migrateConfig, REPORT_KINDS, TEMPLATES } from "./config";
import { ensureReportsDict } from "./i18n";
import { ALL_FILTERS, compute } from "./compute";
import { buildDoc } from "./doc";
import { fixture } from "./fixture";
void ensureReportsDict();

const base = defaultConfig("2026-09-30");

describe("report kinds v2 (1.15.0)", () => {
  it("has four kinds and three templates", () => {
    expect(REPORT_KINDS).toEqual(["halaqa", "student", "attendance", "achievement"]);
    expect(TEMPLATES).toEqual(["official", "brief", "detailed"]);
  });
  it.each([
    ["memorize", ["memorize"], undefined],
    ["review", ["review"], undefined],
    ["daily", ["attendance", "memorize", "review", "evaluation", "notes"], "today"],
    ["monthly", ["attendance", "memorize", "review", "evaluation"], "month"],
    ["cumulative", ["attendance", "memorize", "review", "achievement"], "last90"],
    [
      "comprehensive",
      ["attendance", "memorize", "review", "evaluation", "notes", "achievement"],
      undefined,
    ],
  ])("migrates the legacy %s kind to a halaqa report", (kind, records, preset) => {
    const m = migrateConfig({ kind, records: ["attendance"], preset: "week" }, base);
    expect(m.kind).toBe("halaqa");
    expect(m.records).toEqual(records);
    expect(m.preset).toBe(preset ?? "week");
  });
  it("maps the removed student/halaqa templates to official and keeps the kind", () => {
    expect(migrateConfig({ kind: "student", template: "student" }, base)).toMatchObject({
      kind: "student",
      template: "official",
    });
    expect(migrateConfig({ template: "halaqa" }, base).template).toBe("official");
    expect(migrateConfig({ template: "brief" }, base).template).toBe("brief");
  });
  it("drops sections that the kind does not offer, and never leaves none", () => {
    const m = migrateConfig({ kind: "attendance", records: ["memorize", "notes"] }, base);
    expect(m.records).toEqual(["notes"]);
    expect(m.records.every((r) => KIND_SECTIONS.attendance.includes(r))).toBe(true);
    expect(migrateConfig({ kind: "attendance", records: ["memorize"] }, base).records).toEqual([
      "attendance",
    ]);
  });
  it("survives garbage", () => {
    const m = migrateConfig(
      { kind: "x", template: "y", records: null as never, preset: "z" as never },
      base,
    );
    expect(m.kind).toBe("halaqa");
    expect(m.template).toBe("official");
    expect(m.preset).toBe(base.preset);
    expect(m.records.length).toBeGreaterThan(0);
  });
  it("prints a single-day halaqa report day by day, and one work section in detail", () => {
    const day = buildDoc(
      compute(fixture({ from: "2026-09-01", to: "2026-09-01" }), ALL_FILTERS),
      base,
    );
    expect(day.title).toBe("التقرير اليومي");
    const mem = buildDoc(compute(fixture(), ALL_FILTERS), {
      ...base,
      from: "2026-09-01",
      to: "2026-09-10",
      records: ["memorize"],
    });
    expect(mem.blocks.some((b) => b.type === "heading" && b.text === "الحفظ")).toBe(true);
  });
});
