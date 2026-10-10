import { describe, expect, it } from "vitest";
import { centerSquare, displayableAvatar, newAvatarPath, ownAvatarPath } from "./avatar";

const UID = "11111111-2222-3333-4444-555555555555";
const base = "https://x.supabase.co/storage/v1/object/public/avatars/";

describe("الصورة الشخصية (GAP-08)", () => {
  it("يحذف من مجلده وحده", () => {
    expect(ownAvatarPath(`${base}${UID}/ab.webp?v=1`, UID)).toBe(`${UID}/ab.webp`);
    expect(ownAvatarPath(`${base}other/ab.webp`, UID)).toBeNull();
    expect(ownAvatarPath(`${base}${UID}/../other/x.webp`, UID)).toBeNull();
    expect(ownAvatarPath("https://example.com/me.png", UID)).toBeNull();
    expect(ownAvatarPath(null, UID)).toBeNull();
  });
  it("يعرض روابط http فقط", () => {
    expect(displayableAvatar("javascript:alert(1)")).toBeNull();
    expect(displayableAvatar("data:image/png;base64,AA")).toBeNull();
    expect(displayableAvatar(`${base}${UID}/a.webp`)).toBe(`${base}${UID}/a.webp`);
  });
  it("مسار عشوائي داخل مجلد المستخدم", () => {
    const a = newAvatarPath(UID, "webp");
    expect(a).toMatch(new RegExp(`^${UID}/[0-9a-f]{24}\\.webp$`));
    expect(newAvatarPath(UID, "webp")).not.toBe(a);
  });
  it("قصّ مربّع من الوسط", () => {
    expect(centerSquare(400, 300)).toEqual({ sx: 50, sy: 0, side: 300 });
    expect(centerSquare(300, 500)).toEqual({ sx: 0, sy: 100, side: 300 });
  });
});
