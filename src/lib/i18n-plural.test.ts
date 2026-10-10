import { afterEach, describe, expect, it } from "vitest";
import { intlLocale, plural, setLocale } from "./i18n";

describe("صيغ الجمع ووسم Intl (تحليل «المزيد» I18N-03/04)", () => {
  afterEach(async () => {
    await setLocale("ar");
  });
  it("العربية: مفرد ومثنى وجمع قلّة وكثرة", () => {
    expect(plural("units.days", 1)).toBe("يوم واحد");
    expect(plural("units.days", 2)).toBe("يومان");
    expect(plural("units.days", 7)).toBe("7 أيام");
    expect(plural("units.days", 30)).toBe("30 يوماً");
    expect(plural("units.days", 100)).toBe("100 يوم");
  });
  it("وسم Intl بلغة الواجهة وأرقام لاتينية", async () => {
    expect(intlLocale()).toBe("ar-u-nu-latn");
    expect(new Intl.NumberFormat(intlLocale("ar")).format(1234)).toBe("1,234");
  });
});
