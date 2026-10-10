import { describe, expect, it } from "vitest";
import {
  aggregateFamilies,
  buildClassReport,
  buildStudentReport,
  countExams,
  computeTrend,
  formatDuration,
  mergeWeakSpots,
  periodStart,
  readFamilies,
  type ReportErrorRow,
  type ReportResultRow,
} from "./report";

let seq = 0;

function row(overrides: Partial<ReportResultRow> = {}): ReportResultRow {
  seq += 1;
  return {
    id: `r${seq}`,
    student_id: "s1",
    exam_id: `e${seq}`,
    percentage: 80,
    score: 8,
    possible: 10,
    mastery: "proficient",
    correct_count: 8,
    wrong_count: 2,
    skipped_count: 0,
    duration_seconds: 300,
    analysis: {
      byFamily: [
        { family: "الإكمال", correct: 4, total: 5, percentage: 80 },
        { family: "التسلسل", correct: 4, total: 5, percentage: 80 },
      ],
    },
    created_at: `2026-09-${String(10 + seq).padStart(2, "0")}T10:00:00.000Z`,
    exam: {
      scope_label: "سورة الكهف · الآيات 1–20",
      difficulty: "medium",
      mode: "exam",
      question_count: 10,
    },
    errors: [],
    ...overrides,
  };
}

function err(overrides: Partial<ReportErrorRow> = {}): ReportErrorRow {
  return {
    surah_number: 18,
    surah_name: "الكهف",
    from_ayah: 9,
    to_ayah: 12,
    errors: 1,
    sent_to_review: false,
    ...overrides,
  };
}

describe("readFamilies", () => {
  it("يتجاهل التحليل الناقص أو التالف بدل أن ينهار", () => {
    expect(readFamilies(null)).toEqual([]);
    expect(readFamilies({})).toEqual([]);
    expect(readFamilies({ byFamily: "x" })).toEqual([]);
    expect(
      readFamilies({
        byFamily: [
          { family: "الإكمال", correct: 2, total: 4 },
          { family: 3, correct: 1, total: 1 },
          { family: "صفر", correct: 0, total: 0 },
          { family: "زائد", correct: 9, total: 3 },
        ],
      }),
    ).toEqual([
      { family: "الإكمال", correct: 2, total: 4 },
      { family: "زائد", correct: 3, total: 3 },
    ]);
  });
});

describe("aggregateFamilies", () => {
  it("يجمع الإجابات عبر الاختبارات ويرتّب الأضعف أولاً", () => {
    const families = aggregateFamilies([
      { analysis: { byFamily: [{ family: "الإكمال", correct: 5, total: 5 }] } },
      {
        analysis: {
          byFamily: [
            { family: "الإكمال", correct: 3, total: 5 },
            { family: "المتشابهات", correct: 1, total: 4 },
          ],
        },
      },
    ]);
    expect(families).toEqual([
      { family: "المتشابهات", correct: 1, total: 4, percentage: 25 },
      { family: "الإكمال", correct: 8, total: 10, percentage: 80 },
    ]);
  });
});

describe("mergeWeakSpots", () => {
  it("يدمج المواضع المتداخلة في السورة نفسها ويعدّ الاختبارات التي ظهرت فيها", () => {
    const spots = mergeWeakSpots([
      {
        resultId: "a",
        errors: [err({ from_ayah: 9, to_ayah: 12, errors: 2, sent_to_review: true })],
      },
      {
        resultId: "b",
        errors: [err({ from_ayah: 11, to_ayah: 14, errors: 1, sent_to_review: true })],
      },
      { resultId: "c", errors: [err({ from_ayah: 30, to_ayah: 31, errors: 1 })] },
    ]);
    expect(spots).toEqual([
      {
        surahNumber: 18,
        surahName: "الكهف",
        fromAyah: 9,
        toAyah: 14,
        errors: 3,
        occurrences: 2,
        pending: false,
      },
      {
        surahNumber: 18,
        surahName: "الكهف",
        fromAyah: 30,
        toAyah: 31,
        errors: 1,
        occurrences: 1,
        pending: true,
      },
    ]);
  });

  it("لا يدمج سورتين مختلفتين ولو تطابقت أرقام الآيات", () => {
    const spots = mergeWeakSpots([
      {
        resultId: "a",
        errors: [err(), err({ surah_number: 19, surah_name: "مريم" })],
      },
    ]);
    expect(spots).toHaveLength(2);
  });

  it("يحترم الحد الأقصى ويقدّم الأكثر أخطاءً", () => {
    const errors = Array.from({ length: 8 }, (_, i) =>
      err({ from_ayah: i * 10 + 1, to_ayah: i * 10 + 2, errors: i + 1 }),
    );
    const spots = mergeWeakSpots([{ resultId: "a", errors }], 3);
    expect(spots.map((s) => s.errors)).toEqual([8, 7, 6]);
  });
});

describe("computeTrend", () => {
  it("لا اتجاه لاختبار واحد", () => {
    expect(computeTrend([])).toBeNull();
    expect(computeTrend([70])).toBeNull();
  });

  it("يقارن أحدث الاختبارات بما قبلها بالعدد نفسه", () => {
    expect(computeTrend([90, 60])).toEqual({ trend: "up", delta: 30 });
    expect(computeTrend([50, 55, 60, 80, 85, 90])).toEqual({ trend: "down", delta: -30 });
    expect(computeTrend([72, 70, 71, 70])).toEqual({ trend: "flat", delta: 1 });
  });

  it("لا يتجاوز ثلاثة اختبارات في كل كفّة", () => {
    // أحدث 3 = 90، والثلاثة قبلها = 60، والأقدم (10) خارج المقارنة.
    expect(computeTrend([90, 90, 90, 60, 60, 60, 10, 10])).toEqual({ trend: "up", delta: 30 });
  });
});

describe("buildStudentReport", () => {
  it("يلخّص أداء الطالب ويرتّب اختباراته الأحدث أولاً", () => {
    const report = buildStudentReport("s1", [
      row({ percentage: 60, mastery: "good", created_at: "2026-09-01T00:00:00Z" }),
      row({ percentage: 90, mastery: "mastery", created_at: "2026-09-05T00:00:00Z" }),
      row({ percentage: 75, mastery: "proficient", created_at: "2026-09-03T00:00:00Z" }),
    ]);
    expect(report.examCount).toBe(3);
    expect(report.averagePercentage).toBe(75);
    expect(report.bestPercentage).toBe(90);
    expect(report.lastPercentage).toBe(90);
    expect(report.lastMastery).toBe("mastery");
    expect(report.lastAt).toBe("2026-09-05T00:00:00Z");
    expect(report.results.map((r) => r.percentage)).toEqual([90, 75, 60]);
    expect(report.mastery).toEqual({
      mastery: 1,
      proficient: 1,
      good: 1,
      needs_review: 0,
      weak: 0,
    });
    expect(report.totalSeconds).toBe(900);
    expect(report.trend).toBe("up");
    expect(report.attention).toEqual([]);
  });

  it("ينبّه على المتوسط المنخفض والتراجع وآخر اختبار ضعيف والمواضع المعلّقة", () => {
    const report = buildStudentReport("s1", [
      row({ percentage: 80, created_at: "2026-09-01T00:00:00Z" }),
      row({
        percentage: 30,
        mastery: "weak",
        created_at: "2026-09-02T00:00:00Z",
        errors: [
          err({ from_ayah: 1, to_ayah: 2 }),
          err({ from_ayah: 20, to_ayah: 21 }),
          err({ from_ayah: 40, to_ayah: 41 }),
        ],
      }),
    ]);
    expect(report.averagePercentage).toBe(55);
    expect(report.pendingSpots).toBe(3);
    expect(report.attention).toEqual(["low_average", "last_weak", "declining", "pending_review"]);
  });

  it("المواضع المُرسلة إلى المراجعة لا تُحسب معلّقة", () => {
    const report = buildStudentReport("s1", [
      row({
        errors: [
          err({ from_ayah: 1, to_ayah: 2, sent_to_review: true }),
          err({ from_ayah: 20, to_ayah: 21, sent_to_review: true }),
          err({ from_ayah: 40, to_ayah: 41, sent_to_review: true }),
        ],
      }),
    ]);
    expect(report.pendingSpots).toBe(0);
    expect(report.attention).not.toContain("pending_review");
  });

  it("يتسامح مع مستوى إتقان غير معروف", () => {
    const report = buildStudentReport("s1", [row({ mastery: "legacy" })]);
    expect(report.lastMastery).toBeNull();
    expect(Object.values(report.mastery).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("buildClassReport", () => {
  it("يجمع الحلقة ويقدّم من يحتاج متابعة ثم الأقل متوسطاً", () => {
    const report = buildClassReport([
      row({ student_id: "strong", percentage: 95, mastery: "mastery" }),
      row({
        student_id: "strong",
        percentage: 85,
        mastery: "proficient",
        created_at: "2026-08-01T00:00:00Z",
      }),
      row({ student_id: "mid", percentage: 70, mastery: "good" }),
      row({ student_id: "weak", percentage: 40, mastery: "weak" }),
    ]);
    expect(report.studentCount).toBe(3);
    expect(report.examCount).toBe(4);
    // متوسط الطلاب (90، 70، 40) لا متوسط الاختبارات الأربعة.
    expect(report.averagePercentage).toBe(67);
    expect(report.attentionCount).toBe(1);
    expect(report.students.map((s) => s.studentId)).toEqual(["weak", "mid", "strong"]);
    expect(report.mastery).toEqual({
      mastery: 1,
      proficient: 1,
      good: 1,
      needs_review: 0,
      weak: 1,
    });
    expect(report.families[0].total).toBe(20);
  });

  it("تقرير فارغ دون أخطاء", () => {
    const report = buildClassReport([]);
    expect(report).toMatchObject({
      studentCount: 0,
      examCount: 0,
      averagePercentage: 0,
      attentionCount: 0,
      students: [],
      families: [],
    });
  });
});

describe("periodStart و formatDuration", () => {
  it("يحسب بداية الفترة من لحظة ثابتة", () => {
    const now = new Date("2026-09-22T12:00:00.000Z");
    expect(periodStart("all", now)).toBeNull();
    expect(periodStart("7", now)).toBe("2026-09-15T12:00:00.000Z");
    expect(periodStart("30", now)).toBe("2026-08-23T12:00:00.000Z");
  });

  it("يعدّ الاختبارات بصيغة عربية سليمة", () => {
    expect([1, 2, 3, 10, 11, 100].map(countExams)).toEqual([
      "اختبار واحد",
      "اختباران",
      "3 اختبارات",
      "10 اختبارات",
      "11 اختباراً",
      "100 اختباراً",
    ]);
  });

  it("يعرض المدة بالعربية", () => {
    expect(formatDuration(45)).toBe("45 ث");
    expect(formatDuration(300)).toBe("5 د");
    expect(formatDuration(3600)).toBe("1 س");
    expect(formatDuration(5400)).toBe("1 س 30 د");
  });
});
