import { describe, expect, it } from "vitest";
import { sheetRelease } from "@/lib/sheet-gesture";

describe("نصف الشاشة: نهاية السحب", () => {
  const half = { snap: "half" as const, expanded: false };
  it("لأسفل يغلق، ولأعلى يوسّع", () => {
    expect(sheetRelease({ ...half, dy: 120, velocity: 0.2 })).toBe("close");
    expect(sheetRelease({ ...half, dy: 20, velocity: 0.9 })).toBe("close");
    expect(sheetRelease({ ...half, dy: -60, velocity: -0.1 })).toBe("expand");
    expect(sheetRelease({ ...half, dy: 10, velocity: 0.05 })).toBe("stay");
  });
  it("الموسّعة تصغر بسحب قصير وتُغلق بطويل", () => {
    const ex = { snap: "half" as const, expanded: true };
    expect(sheetRelease({ ...ex, dy: 120, velocity: 0.2 })).toBe("collapse");
    expect(sheetRelease({ ...ex, dy: 260, velocity: 0.2 })).toBe("close");
    expect(sheetRelease({ ...ex, dy: -90, velocity: -1 })).toBe("stay");
  });
  it("بارتفاع المحتوى: لا توسيع", () => {
    expect(sheetRelease({ snap: "auto", expanded: false, dy: -90, velocity: -1 })).toBe("stay");
    expect(sheetRelease({ snap: "auto", expanded: false, dy: 100, velocity: 0 })).toBe("close");
  });
});
