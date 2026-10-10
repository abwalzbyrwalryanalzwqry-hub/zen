import { describe, expect, it } from "vitest";
import { EXPORT_MAX_AGE_MS, exportTotals, staleExports } from "./export-cache";
import { pickEvictions, type DownloadedSurah } from "./quran/recitation-offline";

describe("ملفات التصدير المؤقتة", () => {
  const now = 1_800_000_000_000;
  const files = [
    { name: "تقرير.pdf", size: 1000, mtime: now - 1000 },
    { name: "شهادة.png", size: 2000, mtime: now - EXPORT_MAX_AGE_MS - 1 },
    { name: "بلا-تاريخ.xlsx", size: 500, mtime: 0 },
  ];
  it("يحذف ما تجاوز يوماً وما لا يُعرف تاريخه، ويُبقي الحديث", () => {
    expect(staleExports(files, now).map((f) => f.name)).toEqual(["شهادة.png", "بلا-تاريخ.xlsx"]);
  });
  it("يجمع العدد والحجم", () => {
    expect(exportTotals(files)).toEqual({ count: 3, bytes: 3500 });
  });
});

describe("حدّ مساحة التلاوات", () => {
  const mb = 1024 * 1024;
  const d = (surah: number, bytes: number, at: number, played?: number): DownloadedSurah => ({
    folder: "r",
    surah,
    ayahs: 7,
    bytes,
    dirUri: "",
    at,
    played,
  });
  const list = [
    d(1, 100 * mb, 10, 500),
    d(2, 100 * mb, 20),
    d(3, 100 * mb, 30, 400),
    d(4, 100 * mb, 40),
  ];
  it("بلا حد لا يُحذف شيء", () => {
    expect(pickEvictions(list, 0)).toEqual([]);
  });
  it("يحذف الأقدم تشغيلاً (أو تنزيلاً) حتى يعود تحت الحد", () => {
    expect(pickEvictions(list, 250 * mb).map((x) => x.surah)).toEqual([2, 4]);
  });
  it("لا يحذف السورة التي نُزّلت للتو", () => {
    expect(pickEvictions(list, 250 * mb, "r:2").map((x) => x.surah)).toEqual([4, 3]);
  });
  it("تحت الحد لا يُحذف شيء", () => {
    expect(pickEvictions(list, 400 * mb)).toEqual([]);
  });
});
