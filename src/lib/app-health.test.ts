import { describe, expect, it } from "vitest";
import { hourlyBuckets, parseAppHealth } from "./app-health";

describe("صحة التطبيق (7.7)", () => {
  it("غير صاحب التطبيق ⇒ null", () => {
    expect(parseAppHealth({ status: "not_owner" })).toBeNull();
    expect(parseAppHealth(null)).toBeNull();
  });

  it("يحوّل الأرقام النصية ويقبل الحقول الناقصة", () => {
    const h = parseAppHealth({
      status: "ok",
      days: 7,
      errors_24h: "12",
      errors_period: 40,
      users_period: 3,
      top: [
        {
          message: "x",
          url: "/today",
          source: "client",
          occurrences: "9",
          users: "2",
          last_seen: "t",
        },
      ],
    });
    expect(h).toMatchObject({
      errors24h: 12,
      errorsPeriod: 40,
      usersPeriod: 3,
      hourly: [],
      alerts: [],
    });
    expect(h!.top[0]).toMatchObject({ occurrences: 9, users: 2 });
  });

  it("24 ساعة متصلة، والساعات الفارغة صفر", () => {
    const now = new Date("2026-09-28T10:25:00Z");
    const b = hourlyBuckets([{ hour: "2026-09-28T09:00:00Z", errors: 5 }], now);
    expect(b).toHaveLength(24);
    expect(b[23].hour.toISOString()).toBe("2026-09-28T10:00:00.000Z");
    expect(b[22]).toMatchObject({ errors: 5 });
    expect(b.reduce((s, x) => s + x.errors, 0)).toBe(5);
  });
});
