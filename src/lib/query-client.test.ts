import { describe, expect, it, vi } from "vitest";

let online = true;
vi.mock("@/lib/network", () => ({ isOnline: () => online }));
const { createQueryClient, isPermanentError, shouldRetry } = await import("./query-client");

describe("إعداد React Query (1.16.0)", () => {
  it("لا يُعاد رفض الصلاحية والتحقق ورموز الخادم", () => {
    expect(isPermanentError({ status: 403 })).toBe(true);
    expect(isPermanentError({ code: "42501" })).toBe(true);
    expect(isPermanentError({ code: "P0001", message: "x" })).toBe(true);
    expect(isPermanentError(new Error("NOT_YOUR_HALAQA"))).toBe(true);
    expect(isPermanentError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isPermanentError({ status: 503 })).toBe(false);
  });
  it("محاولتان فقط مع الاتصال، ولا شيء دونه", () => {
    expect(shouldRetry(0, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetry(2, new TypeError("Failed to fetch"))).toBe(false);
    online = false;
    expect(shouldRetry(0, new TypeError("Failed to fetch"))).toBe(false);
    online = true;
  });
  it("الاستعلامات تعمل دون اتصال (offlineFirst) فتصل إلى نسخة الجهاز", () => {
    const q = createQueryClient().getDefaultOptions().queries!;
    expect(q.networkMode).toBe("offlineFirst");
    expect(q.staleTime).toBe(30_000);
  });
});
