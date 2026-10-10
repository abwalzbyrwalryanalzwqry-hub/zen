import { describe, expect, it } from "vitest";
import {
  disableNativePush,
  enableNativePush,
  isNativeApp,
  nativePlatform,
  safeInternalPath,
  deepLinkPath,
} from "./native";
import { fontScaleFromSystem } from "./native-system";

describe("native", () => {
  it("خارج الغلاف: لا منصة أصلية، والتفعيل يعيد رسالة عربية بلا استدعاء", async () => {
    expect(isNativeApp()).toBe(false);
    expect(nativePlatform()).toBeNull();
    expect(await enableNativePush()).toMatch(/تطبيق الهاتف/);
    await expect(disableNativePush()).resolves.toBeUndefined();
  });

  it("رابط الإشعار داخلي فقط", () => {
    expect(safeInternalPath("/today")).toBe("/today");
    expect(safeInternalPath("/quran/student/abc?tab=plan")).toBe("/quran/student/abc?tab=plan");
    expect(safeInternalPath("//evil.example.com")).toBeNull();
    expect(safeInternalPath("https://evil.example.com")).toBeNull();
    expect(safeInternalPath("javascript:alert(1)")).toBeNull();
    expect(safeInternalPath("/a<script>")).toBeNull();
    expect(safeInternalPath(42)).toBeNull();
  });

  it("الروابط العميقة zen:// إلى مسار داخلي آمن فقط (L6)", () => {
    expect(deepLinkPath("zen://quran/2")).toBe("/quran/2");
    expect(deepLinkPath("zen:///today")).toBe("/today");
    expect(deepLinkPath("ZEN://mushaf?surah=2")).toBe("/mushaf?surah=2");
    expect(deepLinkPath("zen://")).toBe("/");
    expect(deepLinkPath("https://evil.example/x")).toBeNull();
    expect(deepLinkPath("zen:////evil.example")).toBe("/evil.example");
    expect(deepLinkPath("zen://a<script>")).toBeNull();
    expect(deepLinkPath(42)).toBeNull();
  });
  it("مقياس خط النظام إلى حجم التطبيق (H5)", () => {
    expect(fontScaleFromSystem(0.85)).toBe("sm");
    expect(fontScaleFromSystem(1)).toBe("md");
    expect(fontScaleFromSystem(1.3)).toBe("lg");
    expect(fontScaleFromSystem(2)).toBe("xl");
    expect(fontScaleFromSystem(Number.NaN)).toBe("md");
  });
});
