import { describe, expect, it } from "vitest";
import { filterSections, normalizeSearch } from "./more-search";
import type { MoreSection } from "./home";

const S: MoreSection[] = [
  {
    key: "app",
    title: "التطبيق",
    links: [
      {
        key: "settingsDisplay",
        to: "/settings/display",
        label: "التفضيلات",
        hint: "اللغة والسمة والخط",
      },
      {
        key: "settingsPrayer",
        to: "/settings/prayer",
        label: "مواقيت الصلاة",
        hint: "طريقة الحساب",
      },
    ],
  },
  {
    key: "about",
    title: "عن زِن",
    links: [{ key: "privacy", to: "/legal/privacy", label: "سياسة الخصوصية", hint: "" }],
  },
];

describe("البحث في «المزيد» (GAP-06)", () => {
  it("يوحّد التشكيل والهمزات والتاء المربوطة", () => {
    expect(normalizeSearch("الإِعْدَادات")).toBe("الاعدادات");
    expect(normalizeSearch("الصلاة")).toBe(normalizeSearch("الصلاه"));
  });
  it("يطابق العنوان والوصف، ويُسقط الأقسام الفارغة", () => {
    const r = filterSections(S, "الصلاه");
    expect(r.map((s) => s.links.map((l) => l.key))).toEqual([["settingsPrayer"]]);
    expect(filterSections(S, "الخط")[0].links[0].key).toBe("settingsDisplay");
    expect(filterSections(S, "لا يوجد")).toEqual([]);
  });
  it("اسم القسم يُبقيه كاملاً، والنص الفارغ لا يصفّي", () => {
    expect(filterSections(S, "زن")[0].key).toBe("about");
    expect(filterSections(S, "  ")).toBe(S);
  });
  it("كل الكلمات مطلوبة", () => {
    expect(filterSections(S, "مواقيت الحساب")[0].links[0].key).toBe("settingsPrayer");
    expect(filterSections(S, "مواقيت الخط")).toEqual([]);
  });
});
