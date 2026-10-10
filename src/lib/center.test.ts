import { describe, expect, it } from "vitest";
import {
  attendanceRate,
  daysAgo,
  hhmm,
  isoDate,
  monthRange,
  slotLabel,
  slotsForDay,
  validateSlot,
} from "./center";
import { buildExportHtml, centerDashboardDoc, sheetName, studentReportDoc } from "./center-export";
import type { CenterDashboard, StudentReport } from "./center";

const slot = {
  weekday: 0,
  start_time: "05:30",
  end_time: "06:30",
  location: null,
  online_url: null,
};

describe("مواعيد الحلقات", () => {
  it("يتحقق من الموعد", () => {
    expect(validateSlot(slot)).toBeNull();
    expect(validateSlot({ ...slot, weekday: 7 })).toMatch(/يوم/);
    expect(validateSlot({ ...slot, end_time: "05:00" })).toMatch(/بعد البداية/);
    expect(validateSlot({ ...slot, end_time: "05:30" })).toMatch(/بعد البداية/);
    expect(validateSlot({ ...slot, online_url: "http://x.com" })).toMatch(/https/);
    expect(validateSlot({ ...slot, online_url: "https://meet.example.com/a" })).toBeNull();
  });

  it("يختار مواعيد اليوم مرتبة", () => {
    const sunday = new Date(2026, 8, 27); // الأحد 27 سبتمبر 2026
    const list = [
      { weekday: 0, start_time: "16:00" },
      { weekday: 1, start_time: "05:00" },
      { weekday: 0, start_time: "05:30" },
    ];
    expect(slotsForDay(list, sunday).map((s) => s.start_time)).toEqual(["05:30", "16:00"]);
  });

  it("ينسّق الأوقات والتسميات", () => {
    expect(hhmm("05:30:00")).toBe("05:30");
    expect(slotLabel({ weekday: 4, start_time: "19:00:00", end_time: "20:00:00" })).toBe(
      "الخميس 19:00–20:00",
    );
  });
});

describe("التواريخ والنسب", () => {
  it("يحسب التواريخ محلياً", () => {
    const d = new Date(2026, 0, 3);
    expect(isoDate(d)).toBe("2026-01-03");
    expect(daysAgo(3, d)).toBe("2025-12-31");
  });
  it("نسبة الحضور تعدّ المتأخر حاضراً", () => {
    expect(attendanceRate({ present: 2, late: 1, absent: 1, excused: 0 })).toBe(75);
    expect(attendanceRate({})).toBeNull();
  });
});

const report: StudentReport = {
  student: { id: "s", name: "بلال" },
  from: "2026-09-01",
  to: "2026-09-30",
  halaqat: [{ name: "حلقة الفجر", teacher_name: "يحيى", center_name: "مركز" }],
  attendance_summary: { present: 3, late: 1, absent: 0, excused: 0 },
  attendance: [{ date: "2026-09-20", status: "present", reason: null }],
  mushaf_summary: { memorized_pages: 4, reviewed_pages: 2, consolidated_pages: 0, avg_rating: 4 },
  mushaf: [{ date: "2026-09-20", page: 12, kind: "memorize", rating: 5, notes: null }],
  assessments: [
    {
      date: "2026-09-20",
      surah_name: "الملك",
      from_ayah: 1,
      to_ayah: 10,
      score: 80,
      approved: true,
      teacher_notes: "<b>ممتاز</b>",
    },
    {
      date: "2026-09-21",
      surah_name: "الملك",
      from_ayah: 11,
      to_ayah: 20,
      score: 90,
      approved: true,
      teacher_notes: null,
    },
  ],
  assignments: [],
  exams: [],
};

describe("تصدير التقارير", () => {
  it("يبني تقرير الطالب", () => {
    const doc = studentReportDoc(report);
    expect(doc.title).toContain("بلال");
    expect(doc.stats.find((s) => s.label === "نسبة الحضور")?.value).toBe("100%");
    expect(doc.stats.find((s) => s.label === "متوسط التسميع")?.value).toBe("85");
    expect(doc.sheets.map((s) => s.title)).toEqual([
      "الحضور",
      "المصحف",
      "التسميع",
      "الواجبات",
      "الاختبارات",
    ]);
    expect(doc.sheets[1].rows[0]).toEqual(["2026-09-20", 12, "حفظ", 5, ""]);
  });

  it("يهرّب HTML في PDF", () => {
    const html = buildExportHtml(studentReportDoc(report));
    expect(html).toContain("&lt;b&gt;ممتاز&lt;/b&gt;");
    expect(html).not.toContain("<b>ممتاز</b>");
    expect(html).toContain('dir="rtl"');
  });

  it("يبني تقرير المركز", () => {
    const d: CenterDashboard = {
      center: { id: "c", name: "مركز الاختبار", city: null },
      period_days: 30,
      since: "2026-08-28",
      can_manage: true,
      totals: {
        halaqat: 1,
        students: 1,
        teachers: 1,
        weekly_slots: 1,
        attendance_records: 2,
        attendance_rate: 50,
        pages_memorized: 3,
        assessments: 1,
        avg_score: 55,
        exams: 0,
        avg_exam: null,
        at_risk: 1,
      },
      halaqat: [
        {
          id: "h",
          name: "حلقة الفجر",
          teacher_id: "t",
          teacher_name: "يحيى",
          students: 1,
          present: 1,
          late: 0,
          absent: 1,
          excused: 0,
          pages_memorized: 3,
          assessments: 1,
          avg_score: 55,
          avg_exam: null,
          slots: [
            {
              id: "x",
              weekday: 0,
              start_time: "05:30",
              end_time: "06:30",
              location: null,
              online_url: null,
            },
          ],
        },
      ],
      teachers: [],
      at_risk: [
        {
          id: "s",
          name: "بلال",
          halaqat: "حلقة الفجر",
          attendance_rate: 50,
          avg_score: 55,
          last_activity: null,
          reasons: ["low_score", "inactive"],
        },
      ],
      weekly: [{ week: "2026-09-21", records: 2, rate: 50 }],
    };
    const doc = centerDashboardDoc(d);
    expect(doc.sheets[0].rows[0][7]).toBe("50%");
    expect(doc.sheets[0].rows[0][12]).toBe("الأحد 05:30–06:30");
    expect(doc.sheets[2].rows[0][5]).toContain("متوسط التسميع أقل من 60");
    expect(doc.sheets).toHaveLength(4);

    // 10.3: المؤشرات تُضاف ورقتين عند توفّرها.
    const withKpis = centerDashboardDoc(d, {
      months: 2,
      halaqat: [
        {
          id: "h1",
          name: "حلقة الفجر",
          students: 3,
          pages_30: 10,
          pages_per_student: 3.3,
          regularity: 50,
          dropouts: 2,
          dropout_rate: 67,
        },
      ],
      totals: { students: 3, pages_30: 10, dropouts: 2, regularity: 50 },
      monthly: [
        { month: "2026-08", pages: 0, attendance_rate: null, active_students: 0 },
        { month: "2026-09", pages: 10, attendance_rate: 50, active_students: 1 },
      ],
    });
    expect(withKpis.sheets.map((x) => x.title).slice(-2)).toEqual([
      "مؤشرات الحلقات",
      "الاتجاه الشهري",
    ]);
    expect(withKpis.sheets[4].rows[0]).toEqual(["حلقة الفجر", 3, 10, 3.3, "50%", 2, "67%"]);
    expect(withKpis.sheets[5].rows[0]).toEqual(["2026-08", 0, "—", 0]);
  });

  it("ينظّف أسماء أوراق Excel ويمنع التكرار", () => {
    const used = new Set<string>();
    expect(sheetName("الحضور/الغياب", used)).toBe("الحضور الغياب");
    expect(sheetName("الحضور/الغياب", used)).toBe("الحضور الغياب 2");
    expect(sheetName("x".repeat(40), used).length).toBeLessThanOrEqual(31);
  });
});

describe("monthRange (11.2)", () => {
  it("يعيد أول الشهر وآخره، ويراعي فبراير الكبيسة", () => {
    expect(monthRange("2026-09")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
  it("يرفض الصيغ غير الصحيحة", () => {
    expect(monthRange("2026-13")).toBeNull();
    expect(monthRange("2026-9")).toBeNull();
    expect(monthRange(undefined)).toBeNull();
  });
});
