import { describe, expect, it } from "vitest";
import { ensureReportsDict } from "./i18n";
void ensureReportsDict();
import { fixture, STUDENTS } from "./fixture";
import { fmtDate, fmtGregorian, fmtHijri, fmtNum, fmtPct, roundTo, toLatinDigits } from "./format";
import { compareTotals, previousRange, sortStats, studentStats, totalsOf, workLine } from "./calc";
import { Coverage, journeyOf, juzBounds, surahMap, TOTAL_AYAHS } from "./achieve";
import { isCorrupt, sanitize, validateReport } from "./validate";
import {
  applyTemplate,
  contrast,
  defaultConfig,
  presetRange,
  rangeError,
  readableColors,
  reportFileName,
} from "./config";
import { ALL_FILTERS, compute } from "./compute";
import { buildDoc, followUpText, milestoneText } from "./doc";

const S = { digits: "arab", calendar: "gregorian" } as const;

describe("format", () => {
  it("rounds without floating-point artifacts", () => {
    expect(roundTo(0.1 + 0.2, 1)).toBe(0.3);
    expect(fmtNum(12.04999, "latn")).toBe("12");
    expect(fmtNum(2.5, "arab")).toBe("٢٫٥");
    expect(fmtNum(null, "latn")).toBe("—");
    expect(fmtPct(87.5, "latn")).toBe("88٪");
  });
  it("formats unified Arabic dates (gregorian, hijri, both)", () => {
    expect(fmtGregorian("2026-09-24", "arab")).toBe("٢٤ سبتمبر ٢٠٢٦");
    expect(fmtHijri("2026-09-24", "arab")).toMatch(/١٤٤٨هـ$/);
    expect(fmtDate("2026-09-24", { digits: "arab", calendar: "both" })).toContain("٢٤ سبتمبر ٢٠٢٦");
    expect(toLatinDigits("٢٠٢٦")).toBe("2026");
  });
});

describe("calc", () => {
  const data = fixture();
  it("counts attendance and rate like the center dashboard", () => {
    const s = studentStats(data, STUDENTS[2]);
    expect(s.attendance).toMatchObject({ present: 5, absent: 5, marked: 10, rate: 50 });
    expect(s.followUp.map((f) => f.kind)).toContain("absences");
    expect(followUpText(s.followUp[0], S)).toBe("تكرر الغياب ٥ مرات خلال الفترة.");
  });
  it("computes pages, ayahs and grade from segments", () => {
    const l = workLine(data.rows[0], "memorize")!;
    expect(l.ayahs).toBe(10);
    expect(l.pages).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(l.pages)).toBe(true);
    expect(l.grade).toBe(4);
  });
  it("aggregates totals and compares periods", () => {
    const stats = STUDENTS.map((s) => studentStats(data, s));
    const tot = totalsOf(stats, 10);
    expect(tot.students).toBe(3);
    expect(tot.absent).toBe(5);
    const changes = compareTotals(tot, { ...tot, rate: (tot.rate ?? 0) - 10 });
    expect(changes.find((c) => c.metric === "rate")?.dir).toBe("up");
    expect(previousRange("2026-09-01", "2026-09-30")).toEqual({
      from: "2026-08-02",
      to: "2026-08-31",
    });
  });
  it("sorts by circle order and by name", () => {
    const stats = STUDENTS.map((s) => studentStats(data, s));
    expect(sortStats(stats, "circle").map((s) => s.student.id)).toEqual(["s1", "s2", "s3"]);
    expect(sortStats(stats, "lowAttendance")[0].student.id).toBe("s3");
  });
});

describe("achieve", () => {
  it("builds a 114-surah map and 30 juz bounds", () => {
    const c = new Coverage();
    c.add(36, 1, 83);
    const map = surahMap(c);
    expect(map).toHaveLength(114);
    expect(map[35].state).toBe("done");
    expect(map[1].state).toBe("none");
    expect(juzBounds()).toHaveLength(30);
    expect(TOTAL_AYAHS).toBe(6236);
  });
  it("records surah milestones only for completed surahs", () => {
    const j = journeyOf(fixture().history.filter((h) => h.student_id === "s2"));
    expect(j.completedSurahs).toBe(2);
    expect(j.milestones.some((m) => m.kind === "surah" && m.surah === 36)).toBe(true);
    const yasin = j.milestones.find((m) => m.kind === "surah")!;
    expect(milestoneText(yasin, S)).toBe("أتمّ حفظ سورة يس");
  });
});

describe("validate", () => {
  it("flags corrupt rows and excludes them", () => {
    const d = fixture();
    d.rows[0] = {
      ...d.rows[0],
      memorize: {
        segments: [{ surah_name: "يس", from_ayah: 1, to_ayah: 500 }],
        score: 90,
        error_type: null,
        notes: null,
      },
    };
    const issues = validateReport(d);
    expect(issues.some((i) => i.kind === "badAyah" && i.severity === "error")).toBe(true);
    expect(isCorrupt(issues, d.rows[0])).toBe(true);
    expect(sanitize(d).rows[0].memorize).toBeNull();
  });
  it("warns about work recorded on an absent day", () => {
    const d = fixture();
    d.rows[2] = { ...d.rows[2], status: "absent", memorize: d.rows[0].memorize };
    expect(validateReport(d).some((i) => i.kind === "workWhileAway")).toBe(true);
  });
});

describe("config", () => {
  it("computes preset ranges", () => {
    expect(presetRange("lastMonth", "2026-10-05")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(presetRange("last30", "2026-10-05")).toEqual({ from: "2026-09-06", to: "2026-10-05" });
    expect(presetRange("custom", "2026-10-05")).toBeNull();
  });
  it("validates ranges", () => {
    expect(rangeError({ from: "2026-09-10", to: "2026-09-01" })).toBe("order");
    expect(rangeError({ from: "2023-01-01", to: "2026-01-01" })).toBe("long");
    expect(rangeError({ from: "2026-09-01", to: "2026-09-30" })).toBeNull();
  });
  it("names files in Arabic with the subject and a readable period", () => {
    const n = (from: string, to: string) =>
      reportFileName({ title: "تقرير الحلقة", subject: "حلقة الفجر", from, to });
    expect(n("2026-09-01", "2026-09-30")).toBe("تقرير الحلقة - حلقة الفجر - سبتمبر 2026");
    expect(n("2026-10-01", "2026-10-06")).toBe("تقرير الحلقة - حلقة الفجر - أكتوبر 2026");
    expect(n("2026-09-10", "2026-09-10")).toBe("تقرير الحلقة - حلقة الفجر - 2026-09-10");
    expect(n("2026-09-05", "2026-10-04")).toBe(
      "تقرير الحلقة - حلقة الفجر - 2026-09-05 إلى 2026-10-04",
    );
    expect(
      reportFileName({ title: "أ/ب", subject: "ج:د", from: "2026-09-10", to: "2026-09-10" }),
    ).toBe("أ-ب - ج-د - 2026-09-10");
  });
  it("fixes unreadable colors instead of allowing them", () => {
    const { colors, fixes } = readableColors({
      ...defaultConfig("2026-09-30").colors,
      text: "#eeeeee",
      headerText: "#0f5f57",
    });
    expect(contrast(colors.text, "#ffffff")).toBeGreaterThanOrEqual(7);
    expect(contrast(colors.headerText, colors.headerBg)).toBeGreaterThanOrEqual(4.5);
    expect(fixes.map((f) => f.key)).toEqual(expect.arrayContaining(["text", "headerText"]));
  });
  it("applies templates without touching the data selection", () => {
    const base = defaultConfig("2026-09-30");
    const c = applyTemplate(base, "brief");
    expect(c.kind).toBe(base.kind);
    expect(c.records).toEqual(base.records);
    expect(c.compare).toBe(false);
  });
});

describe("compute + doc", () => {
  const cfg = { ...defaultConfig("2026-09-10"), from: "2026-09-01", to: "2026-09-10" };
  it("builds an RTL report model with real names and no floating artifacts", () => {
    const c = compute(fixture(), ALL_FILTERS);
    const doc = buildDoc(c, cfg);
    expect(doc.empty).toBe(false);
    expect(doc.title).toBe("تقرير الحلقة");
    const text = JSON.stringify(doc.blocks);
    for (const s of STUDENTS) expect(text).toContain(s.name);
    expect(text).not.toMatch(/\d\.\d{3,}/);
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    const att = doc.blocks.find((b) => b.type === "table");
    expect(att && att.type === "table" && att.columns.map((x) => x.label)).toEqual(
      expect.arrayContaining(["الاسم", "حضور", "استئذان", "غياب", "الإجمالي"]),
    );
  });
  it("filters students and reports empty data honestly", () => {
    const c = compute(fixture({ rows: [], history: [] }), ALL_FILTERS);
    expect(buildDoc(c, cfg).empty).toBe(true);
    const one = compute(fixture(), { ...ALL_FILTERS, students: ["s2"] });
    expect(one.students.map((s) => s.stats.student.id)).toEqual(["s2"]);
  });
  it("builds per-student sections for the student report", () => {
    const c = compute(fixture(), { ...ALL_FILTERS, students: ["s1", "s2"] });
    const doc = buildDoc(c, {
      ...cfg,
      kind: "student",
      records: ["attendance", "memorize", "review", "achievement"],
    });
    expect(doc.blocks.filter((b) => b.type === "student")).toHaveLength(2);
    expect(doc.blocks.some((b) => b.type === "break")).toBe(true);
  });
});
