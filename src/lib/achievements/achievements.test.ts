import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import corpus from "@/data/quran-uthmani.json";
import { completedUnits, juzStartsFromHizb, pageOf, quranUnits, unitProgress } from "./divisions";
import {
  challengePercent,
  groupBadges,
  juzOrdinal,
  streakMessage,
  validateChallenge,
  type Badge,
  type Streak,
} from "./index";
import { certificateFileName } from "./certificate";

const units = quranUnits();
const juz = units.filter((u) => u.kind === "juz");

describe("حدود المصحف", () => {
  it("114 سورة و60 حزباً و30 جزءاً", () => {
    expect(units.filter((u) => u.kind === "surah")).toHaveLength(114);
    expect(units.filter((u) => u.kind === "hizb")).toHaveLength(60);
    expect(juz).toHaveLength(30);
    expect(units).toHaveLength(204);
  });

  it("الأجزاء متصلة وتغطي 604 صفحات", () => {
    expect(juz[0]).toMatchObject({ firstPage: 1, lastPage: 21 });
    expect(juz[1]).toMatchObject({ firstPage: 22, lastPage: 41 });
    expect(juz[29]).toMatchObject({ firstPage: 582, lastPage: 604 });
    for (let i = 1; i < 30; i++) {
      expect(juz[i].firstPage).toBeGreaterThanOrEqual(juz[i - 1].lastPage);
      expect(juz[i].firstPage).toBeLessThanOrEqual(juz[i - 1].lastPage + 1);
    }
  });

  it("البقرة من 2 إلى 49 والناس في 604", () => {
    const s = (n: number) => units.find((u) => u.kind === "surah" && u.no === n)!;
    expect(s(2)).toMatchObject({ firstPage: 2, lastPage: 49 });
    expect(s(114).lastPage).toBe(604);
    expect(pageOf(1, 1)).toBe(1);
    expect(pageOf(114, 6)).toBe(604);
  });

  it("بدايات الأجزاء من الأحزاب تطابق المتن المحلي", () => {
    expect(juzStartsFromHizb().map((r) => [...r])).toEqual(
      (corpus as { juzStarts: number[][] }).juzStarts,
    );
  });

  it("وحدات ملف الهجرة تطابق quranUnits()", () => {
    const sql = readFileSync(
      resolve(__dirname, "../../../supabase/migrations/20260928100000_achievements.sql"),
      "utf8",
    );
    const rows = [...sql.matchAll(/\('(surah|hizb|juz)',(\d+),(\d+),(\d+),/g)].map((m) => ({
      kind: m[1],
      no: +m[2],
      firstPage: +m[3],
      lastPage: +m[4],
    }));
    expect(rows).toEqual(
      units.map(({ kind, no, firstPage, lastPage }) => ({ kind, no, firstPage, lastPage })),
    );
  });

  it("الوحدات المكتملة والتقدّم", () => {
    const pages = Array.from({ length: 23 }, (_, i) => 582 + i);
    const done = completedUnits(pages);
    expect(done.some((u) => u.kind === "juz" && u.no === 30)).toBe(true);
    expect(done.some((u) => u.kind === "surah" && u.no === 114)).toBe(true);
    expect(done.some((u) => u.kind === "juz" && u.no === 29)).toBe(false);
    expect(unitProgress(juz[0], [1, 2, 3])).toEqual({ done: 3, total: 21 });
    expect(completedUnits([])).toEqual([]);
  });
});

describe("نصوص الإنجازات", () => {
  it("ترتيب الأجزاء", () => {
    expect(juzOrdinal(1)).toBe("الأول");
    expect(juzOrdinal(11)).toBe("الحادي عشر");
    expect(juzOrdinal(20)).toBe("العشرون");
    expect(juzOrdinal(21)).toBe("الحادي والعشرون");
    expect(juzOrdinal(30)).toBe("الثلاثون");
    expect(juzOrdinal(31)).toBe("31");
  });

  const st = (p: Partial<Streak>): Streak => ({
    current: 0,
    best: 0,
    active_30: 0,
    today: false,
    wird_today: false,
    last_day: null,
    ...p,
  });

  it("رسالة السلسلة بلا لوم", () => {
    expect(streakMessage(st({}))).toContain("ابدأ اليوم");
    expect(streakMessage(st({ active_30: 5 }))).toContain("5 يوماً");
    expect(streakMessage(st({ current: 3 }))).toContain("سجّل اليوم");
    expect(streakMessage(st({ current: 5, today: true }))).toContain("بقي 2");
    expect(streakMessage(st({ current: 120, today: true }))).toContain("بارك الله");
  });

  it("تجميع الأوسمة", () => {
    const b = (kind: Badge["kind"], no: number): Badge => ({ kind, no, label: "", earned_at: "" });
    const g = groupBadges([b("surah", 114), b("juz", 30), b("surah", 1), b("streak", 7)]);
    expect(g.map((x) => x.kind)).toEqual(["juz", "surah", "streak"]);
    expect(g[1].items.map((x) => x.no)).toEqual([1, 114]);
  });

  it("التحقق من التحدي", () => {
    const ok = {
      title: "ختمة",
      kind: "khatma" as const,
      target: 30,
      starts_on: "2026-10-01",
      ends_on: "2026-10-30",
    };
    expect(validateChallenge(ok)).toBeNull();
    expect(validateChallenge({ ...ok, title: "x" })).not.toBeNull();
    expect(validateChallenge({ ...ok, ends_on: "2026-09-01" })).toContain("قبل");
    expect(validateChallenge({ ...ok, ends_on: "2027-03-01" })).toContain("120");
    expect(validateChallenge({ ...ok, kind: "pages", target: 0 })).not.toBeNull();
  });

  it("نسبة التحدي", () => {
    expect(challengePercent({ progress: 15, target: 30 })).toBe(50);
    expect(challengePercent({ progress: 50, target: 30 })).toBe(100);
    expect(challengePercent({ progress: 1, target: 0 })).toBe(0);
  });

  it("اسم ملف الشهادة", () => {
    expect(certificateFileName({ juz: 30, serial: "ABCDEF1234" })).toBe(
      "zen-certificate-juz30-ABCDEF1234.png",
    );
  });
});
