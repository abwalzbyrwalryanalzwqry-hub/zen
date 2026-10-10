import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "./app-version";

describe("رقم الإصدار المحقون (BUG-16)", () => {
  it("مطابق لـ package.json", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8"));
    expect(APP_VERSION).toBe(pkg.version);
  });
});
