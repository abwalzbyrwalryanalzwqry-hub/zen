import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILD_ONLY, LICENSES, PACKAGE_TO_LICENSE } from "./licenses";

describe("تراخيص المكتبات (تحليل «المزيد» GAP-08)", () => {
  it("كل اعتماد مشحون مذكور بترخيصه", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8"));
    const names = new Set(LICENSES.map((l) => l.name));
    const missing = Object.keys(pkg.dependencies).filter(
      (d) => !BUILD_ONLY.has(d) && !names.has(PACKAGE_TO_LICENSE[d] ?? ""),
    );
    expect(missing).toEqual([]);
  });
  it("الروابط https", () => {
    for (const l of LICENSES) expect(l.url).toMatch(/^https:\/\//);
  });
});
