import { describe, expect, it } from "vitest";
import {
  PERF_BOOT_SCRIPT,
  androidVersion,
  isLowEndDevice,
  parsePerfPreference,
  resolvePerfMode,
  type DeviceHints,
  type PerfPreference,
} from "./perf-mode";

const UA8 = "Mozilla/5.0 (Linux; Android 8.1.0; SM-J260F) AppleWebKit/537.36 Chrome/120 Mobile";
const UA14 = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/128 Mobile";

describe("وضع الأداء", () => {
  it("يقرأ إصدار Android من سلسلة المتصفح", () => {
    expect(androidVersion(UA8)).toBe(8);
    expect(androidVersion(UA14)).toBe(14);
    expect(androidVersion("Mozilla/5.0 (X11; Linux x86_64)")).toBeNull();
  });

  it("يكتشف الجهاز الضعيف بأي إشارة واحدة", () => {
    expect(isLowEndDevice({ deviceMemory: 2, hardwareConcurrency: 8, userAgent: UA14 })).toBe(true);
    expect(isLowEndDevice({ deviceMemory: 8, hardwareConcurrency: 4, userAgent: UA14 })).toBe(true);
    expect(isLowEndDevice({ deviceMemory: 8, hardwareConcurrency: 8, userAgent: UA8 })).toBe(true);
    expect(isLowEndDevice({ deviceMemory: 8, hardwareConcurrency: 8, userAgent: UA14 })).toBe(
      false,
    );
    // ما لا يعلنه المتصفح لا يُحتسب ضعفاً.
    expect(isLowEndDevice({ userAgent: UA14 })).toBe(false);
    expect(isLowEndDevice({ deviceMemory: 0, hardwareConcurrency: 0 })).toBe(false);
  });

  it("اختيار المستخدم يعلو على الاكتشاف", () => {
    const weak: DeviceHints = { deviceMemory: 2, userAgent: UA8 };
    const strong: DeviceHints = { deviceMemory: 8, hardwareConcurrency: 8, userAgent: UA14 };
    expect(resolvePerfMode("off", weak)).toBe(false);
    expect(resolvePerfMode("on", strong)).toBe(true);
    expect(resolvePerfMode("auto", weak)).toBe(true);
    expect(resolvePerfMode("auto", strong)).toBe(false);
  });

  it("القيمة المحفوظة غير المعروفة تعني «تلقائي»", () => {
    expect(parsePerfPreference(null)).toBe("auto");
    expect(parsePerfPreference("x")).toBe("auto");
    expect(parsePerfPreference("on")).toBe("on");
    expect(parsePerfPreference("off")).toBe("off");
  });

  it("سكربت الرأس يطابق resolvePerfMode", () => {
    const cases: Array<[PerfPreference, DeviceHints]> = [];
    for (const p of ["auto", "on", "off"] as const)
      for (const deviceMemory of [undefined, 2, 4, 8])
        for (const hardwareConcurrency of [undefined, 4, 8])
          for (const userAgent of [UA8, UA14, ""])
            cases.push([p, { deviceMemory, hardwareConcurrency, userAgent }]);
    for (const [pref, h] of cases) {
      const cls = new Set<string>();
      const ctx = {
        localStorage: { getItem: () => (pref === "auto" ? null : pref) },
        navigator: {
          deviceMemory: h.deviceMemory,
          hardwareConcurrency: h.hardwareConcurrency,
          userAgent: h.userAgent,
        },
        document: { documentElement: { classList: { add: (c: string) => cls.add(c) } } },
      };
      new Function("localStorage", "navigator", "document", PERF_BOOT_SCRIPT)(
        ctx.localStorage,
        ctx.navigator,
        ctx.document,
      );
      expect(cls.has("perf"), JSON.stringify([pref, h])).toBe(resolvePerfMode(pref, h));
    }
  });
});
