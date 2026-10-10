import { describe, expect, it } from "vitest";
import type { DaySheet } from "@/lib/daily-record";
import type { ReportData } from "./types";
import { coveringReport, mergeSheets, narrow, reportFromSheets, saveReport } from "./offline";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
const row = (date: string, id: string, status: "present" | "absent" = "present") => ({
  date,
  student_id: id,
  status,
  reason: null,
  note: null,
  evaluation: null,
  memorize: null,
  review: null,
});
const data = (from: string, to: string): ReportData => ({
  halaqa: { id: "h", name: "ح", teacher_name: null, center_name: "م" },
  from,
  to,
  today: to,
  generated_at: "2026-10-05T10:00:00.000Z",
  schedule: [],
  students: [
    { id: "a", name: "أ", member: true },
    { id: "b", name: "ب", member: true },
  ],
  days: [
    { date: "2026-10-01", status: "completed", notes: null },
    { date: "2026-10-04", status: "completed", notes: null },
  ],
  rows: [row("2026-10-01", "a"), row("2026-10-01", "b"), row("2026-10-04", "a", "absent")],
  history: [{ student_id: "a", date: "2026-10-01", surah_name: "الملك", from_ayah: 1, to_ayah: 5 }],
});
const sheet = (date: string, students: Partial<DaySheet["students"][number]>[]): DaySheet => ({
  halaqa: { id: "h", name: "ح", teacher_name: null },
  date,
  today: date,
  can_edit: true,
  can_lock: false,
  record: {
    id: "R",
    status: "open",
    version: 1,
    notes: "ن",
    completed_at: null,
    locked_at: null,
    completed_by_name: null,
  },
  students: students.map((p) => ({
    student_id: "a",
    name: "أ",
    avatar: null,
    status: null,
    reason: null,
    version: 0,
    note: null,
    evaluation: null,
    memorize: null,
    review: null,
    last_memorize: null,
    last_review: null,
    absences_30d: 0,
    ...p,
  })),
});

describe("التقارير دون اتصال (1.16.0)", () => {
  it("نسخة أوسع تغطي نطاقاً أضيق وطالباً واحداً وأيام أسبوع، ولا تغطي ما يحتاج سجل الإنجاز", () => {
    const s = mem();
    saveReport(
      { halaqa: "h", from: "2026-10-01", to: "2026-10-31" },
      data("2026-10-01", "2026-10-31"),
      s,
    );
    const hit = coveringReport(
      { halaqa: "h", from: "2026-10-01", to: "2026-10-03", students: ["a"] },
      s,
    );
    expect(hit?.data.rows).toEqual([row("2026-10-01", "a")]);
    expect(hit?.data.students.map((x) => x.id)).toEqual(["a"]);
    expect(hit?.data.days.map((d) => d.date)).toEqual(["2026-10-01"]);
    // 2026-10-04 أحد (0)؛ تصفية بالأحد وحده.
    const sun = coveringReport(
      { halaqa: "h", from: "2026-10-01", to: "2026-10-31", weekdays: [0] },
      s,
    );
    expect(sun?.data.rows.map((r) => r.date)).toEqual(["2026-10-04"]);
    expect(
      coveringReport({ halaqa: "h", from: "2026-10-01", to: "2026-10-31", history: true }, s),
    ).toBeNull();
    expect(coveringReport({ halaqa: "h", from: "2026-09-30", to: "2026-10-03" }, s)).toBeNull();
    expect(coveringReport({ halaqa: "x", from: "2026-10-01", to: "2026-10-03" }, s)).toBeNull();
  });

  it("سجل الإنجاز يُقصّ عند نهاية النطاق المطلوب", () => {
    const d = narrow(data("2026-10-01", "2026-10-31"), {
      halaqa: "h",
      from: "2026-10-02",
      to: "2026-10-03",
      students: null,
      weekdays: null,
      history: true,
    });
    expect(d.history).toHaveLength(1);
    expect(d.rows).toEqual([]);
  });

  it("أوراق الجهاز الأحدث (أو بما لم يُرسل) تحلّ محلّ أيامها، والأقدم لا", () => {
    const q = { halaqa: "h", from: "2026-10-01", to: "2026-10-31", history: true };
    const seg = { surah_name: "نوح", from_ayah: 1, to_ayah: 4 };
    const fresh = sheet("2026-10-04", [
      { status: "late", memorize: { segments: [seg], score: 9, error_type: null, notes: null } },
      { student_id: "b", name: "ب" },
    ]);
    const merged = mergeSheets(
      data("2026-10-01", "2026-10-31"),
      q,
      [
        { sheet: fresh, saved_at: "2026-10-06T00:00:00.000Z", pending: false },
        {
          sheet: sheet("2026-10-01", [{ status: "absent" }]),
          saved_at: "2026-10-01T00:00:00.000Z",
          pending: false,
        },
      ],
      "2026-10-05T10:00:00.000Z",
    );
    expect(merged.rows.filter((r) => r.date === "2026-10-04")).toMatchObject([
      { student_id: "a", status: "late" },
    ]);
    // اليوم الأول من الخادم كما هو (ورقة الجهاز أقدم).
    expect(merged.rows.filter((r) => r.date === "2026-10-01").map((r) => r.status)).toEqual([
      "present",
      "present",
    ]);
    expect(merged.days.find((d) => d.date === "2026-10-04")).toMatchObject({
      status: "open",
      notes: "ن",
    });
    expect(merged.history.at(-1)).toMatchObject({ ...seg, student_id: "a", date: "2026-10-04" });
  });

  it("تقرير جزئي من أوراق الجهاز وحدها، ولا شيء بلا أوراق", () => {
    const q = { halaqa: "h", from: "2026-10-01", to: "2026-10-31" };
    const r = reportFromSheets(q, [
      { sheet: sheet("2026-10-07", [{ status: "present" }]), saved_at: "t", pending: true },
    ]);
    expect(r?.rows).toHaveLength(1);
    expect(r?.students).toEqual([{ id: "a", name: "أ", member: true }]);
    expect(r?.halaqa.center_name).toBeNull();
    expect(reportFromSheets(q, [])).toBeNull();
  });

  it("الحجم محدود: الأقدم يُحذف", () => {
    const s = mem();
    for (let i = 1; i <= 14; i++)
      saveReport(
        { halaqa: "h", from: `2026-01-${String(i).padStart(2, "0")}`, to: "2026-10-31" },
        data("x", "y"),
        s,
      );
    expect(JSON.parse(s.getItem("zen.reports.cache")!)).toHaveLength(12);
  });
});
