import { describe, expect, it } from "vitest";
import {
  isInternalEmail,
  isValidUsername,
  looksLikeEmail,
  normalizeUsername,
  passwordTooLong,
  suggestUsername,
  usernameError,
  usernameToEmail,
} from "./username";

describe("اسم المستخدم", () => {
  it("يوحّد الحالة والأرقام العربية والتشكيل وأشكال الألف", () => {
    expect(normalizeUsername(" Ahmad_1 ")).toBe("ahmad_1");
    expect(normalizeUsername("أحمدُ.٢٠")).toBe("احمد.20");
    expect(normalizeUsername("ـمحمد")).toBe("محمد");
    expect(normalizeUsername("مصطفى")).toBe("مصطفي");
    expect(normalizeUsername("إيمان")).toBe(normalizeUsername("ايمان"));
  });

  it("يقبل الصالح ويرفض غيره برسالة عربية", () => {
    expect(isValidUsername("ahmad_1")).toBe(true);
    expect(isValidUsername("أحمد.ع")).toBe(true);
    expect(usernameError("ab")).toContain("3 أحرف");
    expect(usernameError("1abc")).toContain("ابدأ");
    expect(usernameError("a b")).toContain("بلا مسافات");
    expect(usernameError("a..b")).not.toBeNull();
    expect(usernameError("abc.")).not.toBeNull();
    expect(usernameError("ab$c")).not.toBeNull();
    expect(usernameError("a".repeat(25))).toContain("24");
  });

  it("البريد الداخلي يطابق ما تحسبه قاعدة البيانات (supabase/tests/checks.sql 79)", async () => {
    expect(await usernameToEmail("Ahmad_1")).toBe(
      "e0f254fd64d099e6e86ff329a55e3867@users.zen.invalid",
    );
    expect(await usernameToEmail("أحمدُ.٢٠")).toBe(
      "9c6ef66886f40adeb0ae9fec81de5be9@users.zen.invalid",
    );
    expect(isInternalEmail(await usernameToEmail("x_y"))).toBe(true);
  });

  it("يميّز البريد، ويرفض كلمة مرور تتجاوز حد bcrypt", () => {
    expect(looksLikeEmail("a@b.co")).toBe(true);
    expect(looksLikeEmail("ahmad_1")).toBe(false);
    expect(passwordTooLong("ب".repeat(37))).toBe(true);
    expect(passwordTooLong("a".repeat(72))).toBe(false);
  });
});

describe("اقتراح اسم المستخدم من اسم الطالب", () => {
  it("يعطي اسماً صالحاً من الاسم العربي والإنجليزي", () => {
    expect(suggestUsername("أحمد علي")).toBe("احمد_علي");
    expect(suggestUsername("  Omar  Ali ")).toBe("omar_ali");
    expect(suggestUsername("مُحَمَّد")).toBe("محمد");
    expect(suggestUsername("علي", "2")).toBe("علي2");
  });

  it("يعالج الأسماء القصيرة والغريبة", () => {
    expect(suggestUsername("لي")).toBe("لي_1");
    expect(suggestUsername("123")).toBe("");
    expect(suggestUsername("🙂")).toBe("");
    expect(
      [...suggestUsername("عبد الرحمن بن محمد بن عبد الله الطويل")].length,
    ).toBeLessThanOrEqual(24);
    for (const n of ["أحمد علي", "Omar Ali", "لي", "عبد الرحمن بن محمد بن عبد الله الطويل"]) {
      expect(isValidUsername(suggestUsername(n))).toBe(true);
    }
  });
});
