import { describe, expect, it } from "vitest";
import type { HonorRow } from "./api";
import {
  ceremonyOrder,
  deservedList,
  fairness,
  groupDeserved,
  issueSearch,
  milestoneType,
} from "./honor";
import { calibrationDesign, cleanOffset, fieldsOnly, isField } from "./preprinted";
import { SYSTEM_TEMPLATES } from "./templates";
import { ensureCertificatesDict } from "./i18n";
import type { Milestone } from "@/lib/reports/achieve";

ensureCertificatesDict();

const row = (id: string, items: HonorRow["items"] = [], manual = 0): HonorRow => ({
  student_id: id,
  name: `طالب ${id}`,
  count: items.length,
  manual,
  last: items[0]?.issue_date ?? null,
  items,
});

describe("honor (1.26.0)", () => {
  it("maps milestones to system certificate types", () => {
    expect(milestoneType({ kind: "juz", date: "2026-10-01", juz: 30 })).toEqual({
      type: "juz_complete",
      ref: { kind: "juz", juz: 30 },
    });
    expect(milestoneType({ kind: "khatm", date: "2026-10-01" })?.type).toBe("quran_complete");
    expect(milestoneType({ kind: "regular", date: "2026-10-01", pct: 90 })).toBeNull();
  });

  it("lists who reached a milestone in the period without its certificate", () => {
    const ms: Record<string, Milestone[]> = {
      a: [
        { kind: "juz", date: "2026-10-02", juz: 30 },
        { kind: "juz", date: "2026-10-02", juz: 30 },
        { kind: "juz", date: "2026-05-01", juz: 29 },
      ],
      b: [{ kind: "juz", date: "2026-10-03", juz: 30 }],
      c: [{ kind: "surah", date: "2026-10-04", surah: 2 }],
    };
    const rows = [
      row("a"),
      row("b", [
        { type_key: "juz_complete", ref: { kind: "juz", juz: 30 }, issue_date: "2026-10-05" },
      ]),
      row("c", [
        { type_key: "juz_complete", ref: { kind: "juz", juz: 1 }, issue_date: "2026-10-05" },
      ]),
    ];
    const d = deservedList(rows, (id) => ms[id] ?? [], "2026-09-01", "2026-10-08");
    expect(d.map((x) => [x.student_id, x.type])).toEqual([
      ["c", "surah_complete"],
      ["a", "juz_complete"],
    ]);
    const g = groupDeserved(d);
    expect(g).toHaveLength(2);
    expect(
      issueSearch(
        "h",
        g[1].type,
        g[1].items.map((x) => x.student_id),
        g[1].ref,
      ),
    ).toEqual({
      halaqa: "h",
      type: "juz_complete",
      students: "a",
      juz: 30,
    });
  });

  it("measures fairness", () => {
    const it1 = { type_key: "participation", ref: null, issue_date: "2026-10-01" };
    const f = fairness([
      row("a"),
      row("b", [it1]),
      row("c", [it1, it1, it1], 1),
      row("d", [it1, it1]),
    ]);
    expect(f.dist).toEqual([1, 1, 1, 1]);
    expect(f.honoredPct).toBe(75);
    expect(f.total).toBe(6);
    expect(f.manualPct).toBe(17);
    expect(f.topShare).toBe(2);
    expect(fairness([]).honoredPct).toBe(0);
  });

  it("orders the ceremony by circle then name", () => {
    const o = ceremonyOrder([
      { halaqa_name: "ب", student_name: "زيد" },
      { halaqa_name: "أ", student_name: "يوسف" },
      { halaqa_name: "ب", student_name: "أحمد" },
    ]);
    expect(o.map((x) => x.student_name)).toEqual(["يوسف", "أحمد", "زيد"]);
  });
});

describe("pre-printed paper (1.26.0)", () => {
  const d = SYSTEM_TEMPLATES[0].build();
  it("keeps only variable texts and the QR, shifted by the offset", () => {
    const f = fieldsOnly(d, { dx: 2, dy: -1.5 });
    expect(f.elements.length).toBeGreaterThan(0);
    expect(f.elements.every(isField)).toBe(true);
    expect(f.elements.some((e) => e.type === "frame" || e.type === "ornament")).toBe(false);
    expect(f.page.pattern).toBeNull();
    const src = d.elements.find((e) => e.id === f.elements[0].id)!;
    expect(f.elements[0].x).toBe(src.x + 2);
    expect(f.elements[0].y).toBe(src.y - 1.5);
  });
  it("clamps the offset", () => {
    expect(cleanOffset({ dx: 99, dy: -0.26 })).toEqual({ dx: 20, dy: -0.5 });
    expect(cleanOffset(null)).toEqual({ dx: 0, dy: 0 });
  });
  it("builds a calibration sheet the page size", () => {
    const c = calibrationDesign(d.page, "x");
    expect(c.page.width).toBe(d.page.width);
    expect(c.elements.filter((e) => e.type === "line")).toHaveLength(11);
  });
});

describe("ijazah template", () => {
  it("prints the chain text and the granting sheikh", () => {
    const tpl = SYSTEM_TEMPLATES.find((s) => s.key === "ijazah_classic")!.build();
    const texts = tpl.elements.flatMap((e) => (e.type === "text" ? [e.text] : []));
    expect(texts.some((x) => x.includes("حفص عن عاصم"))).toBe(true);
    expect(texts).not.toContain("{{achievement.description}}");
    expect(tpl.page.orientation).toBe("portrait");
    expect(tpl.elements.some((e) => e.type === "signature" && e.label === "الشيخ المجيز")).toBe(
      true,
    );
  });
});
