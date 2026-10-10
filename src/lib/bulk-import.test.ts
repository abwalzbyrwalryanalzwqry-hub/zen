import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { buildImport, detectColumns, loginCardsHtml, parseDelimited } from "./bulk-import";
import { colIndex, readXlsx } from "./xlsx-lite";

const pw = () => "pass-1234";

describe("استيراد الطلاب (9.3)", () => {
  it("CSV باقتباس وBOM وفاصلة عربية ومنقوطة وتبويب", () => {
    expect(parseDelimited('\uFEFFالاسم,اسم المستخدم\r\n"علي, محمد",ali_m\r\n\r\nسعيد,')).toEqual([
      ["الاسم", "اسم المستخدم"],
      ["علي, محمد", "ali_m"],
      ["سعيد", ""],
    ]);
    expect(parseDelimited("أحمد;ahmad\nبلال;bilal")).toEqual([
      ["أحمد", "ahmad"],
      ["بلال", "bilal"],
    ]);
    expect(parseDelimited("أحمد\tahmad")).toEqual([["أحمد", "ahmad"]]);
    expect(parseDelimited("أحمد،ahmad")).toEqual([["أحمد", "ahmad"]]);
    expect(parseDelimited('"قال ""نعم"""')).toEqual([['قال "نعم"']]);
  });

  it("الأعمدة من العنوان أو بالترتيب", () => {
    expect(
      detectColumns([
        ["username", "name"],
        ["a", "b"],
      ]),
    ).toEqual({ name: 1, username: 0, header: true });
    expect(detectColumns([["أحمد"], ["بلال"]])).toEqual({ name: 0, username: -1, header: false });
  });

  it("المعاينة: اقتراح وتفريق المكرر، وأخطاء كل صف برقم سطره", () => {
    const rows = buildImport(
      [
        ["الاسم", "اسم المستخدم"],
        ["أحمد علي", ""],
        ["أحمد علي", ""],
        ["ب", ""],
        ["سعيد", "1bad"],
        ["خالد", "ahmad_x"],
        ["خالد 2", "AHMAD_X"],
      ],
      pw,
    );
    expect(rows.map((r) => [r.line, r.username, r.error])).toEqual([
      [2, "احمد_علي", null],
      [3, "احمد_علي2", null],
      [4, expect.any(String), "الاسم ناقص (حرفان على الأقل)."],
      [5, "1bad", "ابدأ اسم المستخدم بحرف."],
      [6, "ahmad_x", null],
      [7, "ahmad_x", "اسم المستخدم مكرر في الملف."],
    ]);
    expect(rows[0].password).toBe("pass-1234");
  });

  it("Excel: الورقة الأولى بالنصوص المشتركة والمضمّنة والأرقام", () => {
    const xlsx = zipSync({
      "xl/workbook.xml": strToU8(
        '<workbook><sheets><sheet name="s" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      "xl/sharedStrings.xml": strToU8(
        "<sst><si><t>الاسم</t></si><si><r><t>أحمد </t></r><r><t>علي</t></r></si><si><t>R&amp;D</t></si></sst>",
      ),
      "xl/worksheets/sheet1.xml": strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="C2"><v>42</v></c></row><row r="3"><c r="B3" t="inlineStr"><is><t>بلال</t></is></c><c r="D3" t="s"><v>2</v></c></row></sheetData></worksheet>',
      ),
    });
    expect(readXlsx(xlsx)).toEqual([["الاسم"], ["أحمد علي", "", "42"], ["", "بلال", "", "R&D"]]);
    expect(colIndex("AA10")).toBe(26);
    expect(() => readXlsx(strToU8("not a zip"))).toThrow("ليس جدول Excel");
  });

  it("بطاقات الدخول تهرّب الأسماء", () => {
    const html = loginCardsHtml(
      [{ name: "<b>أحمد</b>", username: "ahmad", password: "p1", recovery_code: "R-1" }],
      "حلقة الفجر",
    );
    expect(html).toContain("&lt;b&gt;أحمد");
    expect(html).not.toContain("<b>أحمد");
    expect(html).toContain("R-1");
  });
});
