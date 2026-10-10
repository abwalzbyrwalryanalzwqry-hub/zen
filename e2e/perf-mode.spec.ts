import { expect, test } from "@playwright/test";
import { gotoReady, installFakeSupabase, seedSession, STUDENT } from "./fake-supabase";

// 1.17.0: «وضع الأداء» في التفضيلات — مفعّل يُبطل التمويه الخلفي، ومتوقف يعيده، ويبقى بعد إعادة التحميل.
test("وضع الأداء: مفعّل ومتوقف من التفضيلات ويُطبَّق قبل أول رسم", async ({ page, context }) => {
  await installFakeSupabase(context, { user: STUDENT });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/settings/display");
  const group = page.getByTestId("perf-mode");
  await expect(group).toBeVisible();
  const blurOf = () =>
    page.evaluate(() => {
      const el = document.querySelector("main .glass, .glass");
      return el ? getComputedStyle(el).backdropFilter : null;
    });

  await group.getByRole("radio", { name: "متوقف" }).click();
  await expect(page.locator("html")).not.toHaveClass(/(^|\s)perf(\s|$)/);
  await expect(page.getByText("وضع الأداء غير فعّال.")).toBeVisible();
  await expect.poll(blurOf).toContain("blur");

  await group.getByRole("radio", { name: "مفعّل" }).click();
  await expect(group.getByRole("radio", { name: "مفعّل" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveClass(/(^|\s)perf(\s|$)/);
  await expect(page.getByText("وضع الأداء فعّال الآن.")).toBeVisible();
  // العنصر قد يحمل transition، فيُنتظر انتهاؤه.
  await expect.poll(blurOf).toBe("none");

  // سكربت الرأس يطبّقه قبل تحميل التطبيق.
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/(^|\s)perf(\s|$)/);
});
