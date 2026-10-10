import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

/**
 * تحليل قسم «المزيد» — المرحلة 4: الشارات من الخادم، والشريط السريع، والبحث في المداخل.
 */
const homeCtx = {
  account_kind: "student",
  is_teacher: false,
  children: 0,
  halaqas_joined: 1,
  halaqas_taught: 0,
  center_staff: false,
};

test("الشارات: الإشعارات غير المقروءة مع الدعوات بجانب مدخلها", async ({ page, context }) => {
  await installFakeSupabase(context, {
    user: STUDENT,
    rpc: { my_home_context: homeCtx, more_badges: { notifications: 2, invites: 1, at_risk: 0 } },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/more");
  const row = page.getByRole("link", { name: /الإشعارات/ }).first();
  await expect(row.getByTestId("more-badge")).toHaveText(/3/, { timeout: 20_000 });
  await expect(row).toHaveAccessibleName(/3 جديدة/);
  await expect(page.getByTestId("more-badge")).toHaveCount(1);
});

test("البحث يصفّي المداخل دون تشكيل، والشريط السريع يبدّل السمة", async ({ page, context }) => {
  await installFakeSupabase(context, { user: STUDENT, rpc: { my_home_context: homeCtx } });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/more");
  const search = page.getByRole("searchbox", { name: "ابحث في «المزيد»" });
  await expect(search).toBeVisible({ timeout: 20_000 });
  await search.fill("الصلاه");
  await expect(page.getByRole("link", { name: /مواقيت الصلاة/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /سياسة الخصوصية/ })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "النتائج: 1" })).toBeVisible();
  await search.fill("كلمة غير موجودة");
  await expect(page.getByText("لا شيء يطابق «كلمة غير موجودة».")).toBeVisible();
  await page.getByRole("button", { name: "مسح البحث" }).click();
  await expect(page.getByRole("link", { name: /سياسة الخصوصية/ })).toBeVisible();

  const dark = page.getByRole("button", { name: "الوضع الداكن" });
  const was = (await page.locator("html").getAttribute("class"))?.includes("dark") ?? false;
  await dark.click();
  await expect(dark).toHaveAttribute("aria-pressed", String(!was));
  await expect(page.locator("html")).toHaveClass(was ? /^(?!.*\bdark\b)/ : /\bdark\b/);
  await page.getByRole("button", { name: /حجم الخط: عادي/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-font", "lg");
});
