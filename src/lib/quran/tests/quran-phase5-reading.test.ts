import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, PAPER_OPTIONS, paperClass } from "@/lib/quran/reading-prefs";

/* المرحلة ٥: لون الورق، وحصر إبقاء الشاشة مضاءة في القراءة. */

describe("لون ورق القراءة", () => {
  it("الافتراضي يتبع سمة التطبيق بلا صنف إضافي", () => {
    expect(DEFAULT_PREFS.paper).toBe("auto");
    expect(paperClass("auto")).toBe("");
  });

  it("لكل لون صنفه المعرَّف في styles.css", () => {
    const css = readFileSync(
      fileURLToPath(new URL("../../../../src/styles.css", import.meta.url)),
      "utf8",
    );
    for (const o of PAPER_OPTIONS.filter((p) => p.key !== "auto")) {
      expect(css).toContain(`.${paperClass(o.key)} {`);
    }
  });
});

describe("إبقاء الشاشة مضاءة", () => {
  it("جذر التطبيق لا يطلب قفل الشاشة لجلسة التطبيق كلها", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../../../src/routes/__root.tsx", import.meta.url)),
      "utf8",
    );
    expect(src).not.toMatch(/wakeLock\s*\??\.\s*request/);
  });
});
