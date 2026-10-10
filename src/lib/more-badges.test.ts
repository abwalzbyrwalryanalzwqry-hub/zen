import { describe, expect, it } from "vitest";
import { badgeFor, badgeText, NO_BADGES, parseBadges } from "./more-badges";

describe("شارات «المزيد» (GAP-01)", () => {
  it("يقرأ الأعداد ويصفّر القيم الغريبة", () => {
    expect(parseBadges({ notifications: 3, invites: "2", at_risk: -1 })).toEqual({
      notifications: 3,
      invites: 2,
      at_risk: 0,
    });
    expect(parseBadges(null)).toEqual(NO_BADGES);
  });
  it("الإشعارات تجمع الدعوات، والمتعثّرون لمدخلهم وحده", () => {
    const b = { notifications: 2, invites: 1, at_risk: 4 };
    expect(badgeFor("notifications", b)).toBe(3);
    expect(badgeFor("atRisk", b)).toBe(4);
    expect(badgeFor("centers", b)).toBe(0);
  });
  it("99+ للأعداد الكبيرة", () => {
    expect(badgeText(7)).toBe("7");
    expect(badgeText(150)).toBe("99+");
  });
});
