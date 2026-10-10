import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { excelBlob, workbookSheets, type ExportDoc } from "./center-export";

const doc: ExportDoc = {
  title: "تقرير الحلقة",
  subtitle: "آخر 30 يوماً",
  stats: [{ label: "الطلاب", value: "12" }],
  sheets: [
    {
      title: "الطلاب",
      columns: ["الاسم", "الآيات"],
      rows: [
        ["بلال", 40],
        ["سالم", null],
      ],
    },
    { title: "الطلاب", columns: ["اليوم"], rows: [["الأحد"]] },
  ],
} as ExportDoc;

describe("تصدير Excel بـ write-excel-file (7.4)", () => {
  it("ورقة ملخص ثم ورقة لكل جدول، بأسماء فريدة ومن اليمين لليسار", () => {
    const sheets = workbookSheets(doc);
    expect(sheets.map((s) => s.sheet)).toEqual(["الملخص", "الطلاب", "الطلاب 2"]);
    expect(sheets.every((s) => s.rightToLeft)).toBe(true);
    expect(sheets[1].data[0][0]).toMatchObject({ value: "الاسم", fontWeight: "bold" });
    expect(sheets[1].data[2][1]).toEqual({ value: "", type: String });
    expect(sheets[1].data[1][1]).toEqual({ value: 40, type: Number });
  });

  it("ملف xlsx صالح فيه الأوراق والنص العربي واتجاه RTL", async () => {
    const blob = await excelBlob(doc);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const wb = strFromU8(files["xl/workbook.xml"]);
    expect(wb).toContain('name="الملخص"');
    expect(wb).toContain('name="الطلاب 2"');
    const sheet2 = strFromU8(files["xl/worksheets/sheet2.xml"]);
    expect(sheet2).toMatch(/rightToLeft="(1|true)"/);
    const all = Object.keys(files)
      .map((k) => strFromU8(files[k]))
      .join("");
    expect(all).toContain("بلال");
  });
});
