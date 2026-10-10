import { describe, expect, it } from "vitest";
import { ensureReportsDict } from "./i18n";
void ensureReportsDict();
import { fixture } from "./fixture";
import { defaultConfig } from "./config";
import { ALL_FILTERS, compute } from "./compute";
import { summaryBlock } from "./sections";

const S = { digits: "latn", calendar: "gregorian" } as const;
type Item = { label: string; value: string };
const itemsOf = (b: unknown) => (b as { items: Item[] }).items;

describe("التعديلات بعد الإغلاق في ملخص التقرير (1.21.1)", () => {
  const cfg = defaultConfig("2026-09-30");
  it("تظهر بعدد الأيام المعدّلة حين توجد", () => {
    const base = fixture();
    const days = base.days.map((d, i) => ({
      ...d,
      edits_after_close: i === 0 ? 3 : i === 1 ? 1 : 0,
    }));
    const block = summaryBlock(compute(fixture({ days }), ALL_FILTERS), cfg, S);
    const item = itemsOf(block).find((x) => x.label === "أيام عُدّلت بعد الإغلاق");
    expect(item?.value).toBe("2");
  });
  it("لا تظهر بلا تعديلات أو مع بيانات قديمة بلا الحقل", () => {
    const block = summaryBlock(compute(fixture(), ALL_FILTERS), cfg, S);
    expect(itemsOf(block).some((x) => x.label === "أيام عُدّلت بعد الإغلاق")).toBe(false);
  });
});
