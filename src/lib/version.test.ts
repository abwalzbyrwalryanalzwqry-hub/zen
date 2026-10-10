import { describe, expect, it } from "vitest";
import {
  changelogVersion,
  gradleVersion,
  resolveVersionCode,
  setGradleVersion,
  versionMismatches,
} from "../../scripts/version-lib.mjs";

const GRADLE = `android {\n    defaultConfig {\n        versionCode 6\n        versionName "1.3.0"\n    }\n}\n`;

describe("سياسة الإصدار", () => {
  it("يأخذ أول رقم إصدار من عناوين CHANGELOG", () => {
    const md =
      "# سجل\n\n## بلا رقم\n\n- الإصدار 9.9.9 داخل نص\n\n## المرحلة 6 — الإصدار 1.4.0\n\n## قديم — الإصدار 1.3.0\n";
    expect(changelogVersion(md)).toBe("1.4.0");
    expect(changelogVersion("# سجل\n")).toBeNull();
  });

  it("يقرأ build.gradle ويكتبه دون لمس غيره", () => {
    expect(gradleVersion(GRADLE)).toEqual({ name: "1.3.0", code: 6 });
    const out = setGradleVersion(GRADLE, "1.4.0", 107);
    expect(gradleVersion(out)).toEqual({ name: "1.4.0", code: 107 });
    expect(setGradleVersion(GRADLE, "1.4.0", 6).replace("1.4.0", "1.3.0")).toBe(GRADLE);
  });

  it("versionCode لا يتراجع ولا يقبل قيمة غير صحيحة", () => {
    expect(resolveVersionCode(6, undefined)).toBe(6);
    expect(resolveVersionCode(6, "")).toBe(6);
    expect(resolveVersionCode(6, "107")).toBe(107);
    expect(() => resolveVersionCode(6, "5")).toThrow();
    expect(() => resolveVersionCode(6, "abc")).toThrow();
    expect(() => resolveVersionCode(6, "1.5")).toThrow();
  });

  it("يكشف عدم التطابق", () => {
    expect(versionMismatches({ changelog: "1.3.0", pkg: "1.3.0", gradle: "1.3.0" })).toEqual([]);
    expect(versionMismatches({ changelog: "1.3.0", pkg: undefined, gradle: "1.2.1" })).toHaveLength(
      2,
    );
    expect(versionMismatches({ changelog: null, pkg: null, gradle: null })[0]).toContain(
      "CHANGELOG",
    );
  });
});
