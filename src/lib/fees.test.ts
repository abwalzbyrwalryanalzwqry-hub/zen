import { describe, expect, it } from "vitest";
import {
  balanceOf,
  ledgerLines,
  parseAmount,
  receiptExt,
  receiptPath,
  type FeeStatement,
} from "./fees";

describe("دفتر الرسوم", () => {
  it("المبلغ بالأرقام العربية وفواصل الآلاف", () => {
    expect(parseAmount("٥٠٠٠")).toBe(5000);
    expect(parseAmount("12,500")).toBe(12500);
    expect(parseAmount("١٢٬٥٠٠٫٥")).toBe(12500.5);
    expect(parseAmount("۳۰۰")).toBe(300);
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("1.234")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
  it("الرصيد المستحق والدائن", () => {
    expect(balanceOf({ charged: 5000, paid: 2000 })).toEqual({ due: 3000, credit: 0 });
    expect(balanceOf({ charged: 1000, paid: 1500 })).toEqual({ due: 0, credit: 500 });
  });
  it("مسار الإيصال في مجلد المركز ثم المرسل، والصيغ المسموحة فقط", () => {
    expect(receiptPath("c", "u", "jpg", 7)).toBe("c/u/7.jpg");
    expect(receiptExt("image/png")).toBe("png");
    expect(receiptExt("application/pdf")).toBeNull();
  });
  it("الكشف الزمني: الأحدث أولاً، والدفعة قبل المستحق في اليوم نفسه", () => {
    const s: FeeStatement = {
      center_id: "c",
      center_name: "م",
      charged: 2,
      paid: 1,
      currency: "YER",
      charges: [
        {
          id: "c1",
          title: "سبتمبر",
          amount: 1,
          currency: "YER",
          due_date: "2026-09-01",
          cancelled: false,
        },
        {
          id: "c2",
          title: "أكتوبر",
          amount: 1,
          currency: "YER",
          due_date: "2026-10-01",
          cancelled: false,
        },
      ],
      payments: [
        {
          id: "p1",
          amount: 1,
          currency: "YER",
          method: "cash",
          reference: null,
          paid_on: "2026-10-01",
          source: "manual",
          voided: false,
        },
      ],
      receipts: [],
    };
    expect(ledgerLines(s).map((l) => l.id)).toEqual(["p1", "c2", "c1"]);
  });
});
