import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_STARTS } from "@/lib/quran/structure-data";
import { pageOf } from "@/lib/daily-record";
import { anomaliesFor, changedFields, sortAnomalies, type AnomalyReport } from "./record-audit";

describe("دقة الإدخال", () => {
  it("جدول الصفحات في الخادم يطابق PAGE_STARTS حرفاً بحرف", () => {
    const sql = readFileSync(
      join(__dirname, "../../supabase/migrations/20261208100000_daily_record_audit.sql"),
      "utf8",
    );
    const body = /FUNCTION private\.ayah_page[\s\S]*?ARRAY\[([\s\S]*?)\]/.exec(sql)?.[1] ?? "";
    const keys = body.split(",").map((x) => Number(x.trim()));
    expect(keys).toEqual(PAGE_STARTS.map(([s, a]) => s * 1000 + a));
    // ومنطق الخادم (عدد البدايات ≤ الآية) يساوي pageOf في الواجهة.
    const serverPage = (s: number, a: number) => keys.filter((k) => k <= s * 1000 + a).length;
    for (const [s, a] of [
      [1, 1],
      [2, 5],
      [2, 6],
      [18, 1],
      [67, 30],
      [114, 6],
    ] as const)
      expect(serverPage(s, a)).toBe(pageOf(s, a));
  });

  it("الحقول التي تغيّرت بين اللقطتين فقط", () => {
    expect(
      changedFields(
        { status: "present", memorize: { segments: [], score: 85 } },
        { status: "late", memorize: { segments: [], score: 85 }, note: "x" },
      ),
    ).toEqual(["status", "note"]);
    expect(changedFields(null, null)).toEqual([]);
  });

  it("بنود الطالب، وما يحتاج تحققاً أولاً", () => {
    const r: AnomalyReport = {
      halaqa_id: "h",
      days: 30,
      from: "2026-09-01",
      to: "2026-09-30",
      records: 20,
      items: [
        { code: "perfect_attendance", student_id: "a", detail: {} },
        { code: "pages_spike", student_id: "a", date: "2026-09-02", detail: { pages: 7 } },
        { code: "pages_spike", student_id: "b", date: "2026-09-05", detail: { pages: 9 } },
        { code: "late_close", detail: { count: 3 } },
      ],
    };
    expect(anomaliesFor(r, "a").map((i) => i.code)).toEqual(["perfect_attendance", "pages_spike"]);
    expect(sortAnomalies(r.items).map((i) => i.code)).toEqual([
      "pages_spike",
      "pages_spike",
      "late_close",
      "perfect_attendance",
    ]);
    expect(sortAnomalies(r.items)[0].student_id).toBe("b");
  });
});
