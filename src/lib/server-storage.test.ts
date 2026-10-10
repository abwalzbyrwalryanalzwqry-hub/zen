import { describe, expect, it } from "vitest";
import { formatBytes, parseStorageUsage, PLAN_LIMITS } from "./server-storage";

describe("مراقبة الحجم (المرحلة 2.3)", () => {
  it("غير المالك ⇒ null", () => {
    expect(parseStorageUsage({ status: "not_owner" })).toBeNull();
    expect(parseStorageUsage(null)).toBeNull();
  });
  it("يجمع الحاويات ويرتّبها وينذر فوق 80%", () => {
    const u = parseStorageUsage({
      status: "ok",
      db_bytes: PLAN_LIMITS.dbBytes * 0.5,
      buckets: {
        "chat-media": { objects: 3, bytes: 10 },
        recitations: { objects: 9, bytes: PLAN_LIMITS.storageBytes * 0.85 },
      },
      audio_purged_30d: 4,
      audio_pending_purge: "2",
    })!;
    expect(u.buckets[0].id).toBe("recitations");
    expect(u.warn).toBe(true);
    expect(u.pendingPurge).toBe(2);
    expect(u.dbRatio).toBeCloseTo(0.5);
  });
  it("تنسيق البايتات", () => {
    expect(formatBytes(1536, "en")).toBe("1.5 KB");
    expect(formatBytes(0, "en")).toBe("0 B");
  });
});
