import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  activeNavKey,
  EMPTY_CONTEXT,
  guestMoreSections,
  guestNavItems,
  ownerSection,
  supportSection,
  moreSectionsFor,
  navItemsFor,
  needsKindChoice,
  resolveHomeMode,
  type HomeContext,
} from "./home";
import { exportFileName, groupByBucket, DELETE_CONFIRM_PHRASE, deleteMyAccount } from "./account";
import { parseFontScale } from "./a11y";

const ctx = (over: Partial<HomeContext> = {}): HomeContext => ({ ...EMPTY_CONTEXT, ...over });

describe("اختيار الواجهة حسب الدور", () => {
  it("المعلّم أولاً ولو اختار ولي أمر", () => {
    expect(resolveHomeMode(ctx({ is_teacher: true, account_kind: "guardian" }))).toBe("teacher");
  });
  it("ولي الأمر باختياره", () => {
    expect(resolveHomeMode(ctx({ account_kind: "guardian" }))).toBe("guardian");
  });
  it("بلا اختيار: له أبناء وليس في حلقة ⇒ ولي أمر", () => {
    expect(resolveHomeMode(ctx({ children: 2 }))).toBe("guardian");
    expect(resolveHomeMode(ctx({ children: 2, halaqas_joined: 1 }))).toBe("student");
  });
  it("اختيار «طالب» يغلب وجود الأبناء", () => {
    expect(resolveHomeMode(ctx({ account_kind: "student", children: 1 }))).toBe("student");
  });
  it("الافتراضي طالب، ويُسأل مرة واحدة ولا يُسأل المعلّم", () => {
    expect(resolveHomeMode(EMPTY_CONTEXT)).toBe("student");
    expect(needsKindChoice(EMPTY_CONTEXT)).toBe(true);
    expect(needsKindChoice(ctx({ account_kind: "student" }))).toBe(false);
    expect(needsKindChoice(ctx({ is_teacher: true }))).toBe(false);
  });
});

describe("الشريط السفلي", () => {
  it("خمسة عناصر على الأكثر وآخرها «المزيد»", () => {
    for (const m of ["student", "teacher", "guardian"] as const) {
      const items = navItemsFor(m);
      expect(items.length).toBeLessThanOrEqual(5);
      expect(items.at(-1)?.key).toBe("more");
    }
  });
  it("ولي الأمر بلا أدوات الطالب", () => {
    const keys = navItemsFor("guardian").map((i) => i.key);
    expect(keys).toContain("family");
    expect(keys).not.toContain("quran");
    expect(keys).not.toContain("mushaf");
  });
  it("المعلّم يرى طلابه", () => {
    expect(navItemsFor("teacher").map((i) => i.key)).toContain("teacher");
  });
  it("الصفحة غير الموجودة في الشريط تنشّط «المزيد»", () => {
    const items = navItemsFor("student");
    expect(activeNavKey("/quran", items)).toBe("quran");
    expect(activeNavKey("/chats/abc", items)).toBe("chats");
    expect(activeNavKey("/exams/new", items)).toBe("more");
  });
  it("مسار /quran/students لا ينشّط «الحفظ» للمعلّم (ليس في شريطه)", () => {
    expect(activeNavKey("/quran/students", navItemsFor("teacher"))).toBe("more");
  });
});

describe("صفحة المزيد", () => {
  const links = (m: Parameters<typeof moreSectionsFor>[0], c = EMPTY_CONTEXT) =>
    moreSectionsFor(m, c).flatMap((s) => s.links.map((l) => l.to));
  it("ولي الأمر لا يرى التسميع ولا الاختبارات ولا الإنجازات", () => {
    const l = links("guardian");
    expect(l).not.toContain("/recite");
    expect(l).not.toContain("/exams");
    expect(l).not.toContain("/achievements");
    expect(navItemsFor("guardian").map((i) => i.to)).toContain("/family");
  });
  it("الإعدادات في كل الأدوار، ولا تكرار لعنصر الشريط ولا لبطاقة الحساب (IA-02)", () => {
    for (const m of ["student", "teacher", "guardian"] as const) {
      const l = links(m);
      expect(l).toContain("/settings/display");
      expect(l).toContain("/settings/notifications");
      expect(l).not.toContain("/account");
      const nav = navItemsFor(m).map((i) => i.to);
      expect(l.filter((x) => nav.includes(x))).toEqual([]);
      expect(new Set(l).size).toBe(l.length);
    }
  });
  it("الطالب الذي له أبناء يرى المتابعة", () => {
    expect(links("student", ctx({ children: 1 }))).toContain("/family");
    expect(links("student")).not.toContain("/family");
  });
});

describe("«المزيد» للضيف (IA-03/05)", () => {
  it("لا يكرّر ما في شريطه، ويصل إلى الخصوصية والشروط", () => {
    const l = guestMoreSections().flatMap((s) => s.links.map((x) => x.to));
    const nav = guestNavItems().map((i) => i.to);
    expect(l.filter((x) => nav.includes(x))).toEqual([]);
    expect(l).toContain("/legal/privacy");
    expect(l).toContain("/legal/terms");
    expect(l).toContain("/about");
  });
  it("قسم صاحب التطبيق يضم الاستخدام (BUG-18)", () => {
    expect(ownerSection().links.map((l) => l.to)).toEqual([
      "/app-health",
      "/owner/usage",
      "/owner/feedback",
    ]);
  });
  it("الدعم: الضيف بلا إبلاغ (يحتاج حساباً)، والحساب معه (GAP-02/07)", () => {
    expect(supportSection(true).links.map((l) => l.to)).toEqual(["/help", "/about/whats-new"]);
    expect(supportSection().links.map((l) => l.to)).toEqual([
      "/help",
      "/feedback",
      "/about/whats-new",
    ]);
    expect(guestMoreSections().some((s) => s.key === "support")).toBe(true);
  });
});

describe("بيانات الحساب", () => {
  it("اسم ملف التصدير بالتاريخ", () => {
    expect(exportFileName(new Date("2026-09-27T10:00:00Z"))).toBe("zen-export-2026-09-27.json");
  });
  it("يجمع الملفات حسب الحاوية", () => {
    const g = groupByBucket([
      { bucket_id: "recitations", name: "u/1.webm" },
      { bucket_id: "chat-media", name: "c/u/1.jpg" },
      { bucket_id: "recitations", name: "u/2.webm" },
    ]);
    expect(g.get("recitations")).toEqual(["u/1.webm", "u/2.webm"]);
    expect(g.get("chat-media")).toEqual(["c/u/1.jpg"]);
  });
  it("الحذف يرفض بلا عبارة التأكيد قبل أي نداء", async () => {
    await expect(deleteMyAccount("نعم")).rejects.toThrow(DELETE_CONFIRM_PHRASE);
  });
});

describe("حجم الخط", () => {
  it("القيم المجهولة تعود إلى العادي", () => {
    expect(parseFontScale("lg")).toBe("lg");
    expect(parseFontScale("huge")).toBe("md");
    expect(parseFontScale(null)).toBe("md");
  });
});

describe("مفاتيح «المزيد» الثابتة (تحليل «المزيد» A11Y-01)", () => {
  const ctxAll = { ...EMPTY_CONTEXT, children: 1, center_staff: true, is_teacher: true };
  const all = [
    ...guestMoreSections(),
    ...(["student", "teacher", "guardian"] as const).flatMap((m) => moreSectionsFor(m, ctxAll)),
  ];
  it("مفتاح كل قسم ومدخل لاتيني بلا مسافات", () => {
    for (const s of all) {
      expect(s.key).toMatch(/^[a-zA-Z]+$/);
      for (const l of s.links) expect(l.key).toMatch(/^[a-zA-Z]+$/);
    }
  });
  it("لا قسم مكرّر المفتاح في الدور الواحد", () => {
    for (const m of ["student", "teacher", "guardian"] as const) {
      const keys = moreSectionsFor(m, ctxAll).map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
