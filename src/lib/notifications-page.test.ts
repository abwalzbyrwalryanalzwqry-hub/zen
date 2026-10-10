import { describe, expect, it } from "vitest";
import { internalLink, notificationTitle } from "./notifications-page";

describe("روابط التنبيهات", () => {
  it("المسارات الداخلية فقط", () => {
    expect(internalLink("/teacher?tab=review")).toBe("/teacher?tab=review");
    expect(internalLink("//evil.example")).toBeNull();
    expect(internalLink("https://evil.example")).toBeNull();
    expect(internalLink(null)).toBeNull();
  });
});

describe("عنوان التنبيه بلغة الواجهة", () => {
  it("النوع المعروف من القاموس، وغيره كما هو", () => {
    expect(notificationTitle({ kind: "daily_record", title: "x" })).toBe("اكتمل السجل اليومي");
    expect(notificationTitle({ kind: "other", title: "نص الخادم" })).toBe("نص الخادم");
  });
});
