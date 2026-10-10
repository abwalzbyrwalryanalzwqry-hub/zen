import { expect, test } from "@playwright/test";
import { gotoReady, installFakeSupabase, seedSession, STUDENT } from "./fake-supabase";

// 1.35.0: العربية وحدها (حُذفت الإنجليزية)، فلا منتقي لغة، ومن اختار الإنجليزية في إصدار قديم يعود للعربية.
test("لا تظهر إلا اللغات الجاهزة، والمحفوظة غير الجاهزة تعود للعربية", async ({
  page,
  context,
}) => {
  await installFakeSupabase(context, { user: STUDENT });
  await seedSession(context, STUDENT);
  await context.addInitScript(() => {
    if (!sessionStorage.getItem("zen-e2e-locale-seeded")) {
      sessionStorage.setItem("zen-e2e-locale-seeded", "1");
      localStorage.setItem("zen-locale", "en");
    }
  });
  await gotoReady(page, "/settings/display");
  await expect(page.getByRole("radio", { name: "English" })).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  await gotoReady(page, "/today");
  await expect(
    page.getByRole("navigation", { name: "التنقّل الرئيسي" }).getByRole("link", { name: "اليوم" }),
  ).toBeVisible({ timeout: 20_000 });
});
