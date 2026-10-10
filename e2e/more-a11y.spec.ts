import { expect, test } from "@playwright/test";
import { audit } from "./a11y-audit";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

/**
 * تحليل قسم «المزيد» — المرحلة 5: فحص وصول آلي خفيف لكل صفحات «المزيد» (بلا axe في الاعتماديات).
 * القواعد التي اكتشفها التحليل يدوياً من قبل: اسم مقروء لكل عنصر تفاعلي، و`alt` لكل صورة، ومعرّفات فريدة،
 * ومراجع aria-labelledby/describedby موجودة، وعنوان h1 واحد، وlang/dir على <html>، وأهداف لمس 24px على الأقل
 * (WCAG 2.2 AA 2.5.8؛ صفوف «المزيد» نفسها 44px ويحرسها a11y.test).
 */
const homeCtx = {
  account_kind: "student",
  is_teacher: false,
  children: 0,
  halaqas_joined: 1,
  halaqas_taught: 0,
  center_staff: false,
};

const PAGES = [
  "/more",
  "/account",
  "/settings",
  "/settings/display",
  "/settings/notifications",
  "/settings/prayer",
  "/about",
  "/about/licenses",
  "/about/whats-new",
  "/help",
  "/feedback",
  "/notifications",
  "/storage",
];

for (const path of PAGES) {
  test(`وصول: ${path}`, async ({ page, context }) => {
    await installFakeSupabase(context, {
      user: STUDENT,
      rpc: { my_home_context: homeCtx, more_badges: { notifications: 1, invites: 0, at_risk: 0 } },
      tables: { profiles: [{ id: STUDENT.id, name: STUDENT.name, avatar: null, role: "student" }] },
    });
    await seedSession(context, STUDENT);
    await gotoReady(page, path);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
    // انتظار سكون الطلبات كي لا يُفحص هيكل التحميل.
    await page.waitForLoadState("networkidle");
    expect(await audit(page)).toEqual([]);
  });
}

for (const path of ["/more", "/help", "/about"]) {
  test(`وصول للضيف: ${path}`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("zen-onboarded", "1");
      localStorage.setItem("zen-guest", "1");
    });
    await gotoReady(page, path);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
    expect(await audit(page)).toEqual([]);
  });
}
