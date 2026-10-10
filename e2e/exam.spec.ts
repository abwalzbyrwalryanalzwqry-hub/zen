import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

test("اختبار حفظ من المتن المحلي: إنشاء، إجابة، تسليم، نتيجة", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, { user: STUDENT });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/exams/new");
  await page.getByRole("button", { name: "5", exact: true }).click();
  await page.getByRole("button", { name: "ابدأ الاختبار" }).click();
  await page.waitForURL("**/exams/run");
  await expect(page.getByText(/سؤال 1 من 5/)).toBeVisible();

  for (let i = 1; i <= 5; i++) {
    await expect(page.getByText(new RegExp(`سؤال ${i} من 5`))).toBeVisible();
    // خيارات الإجابة أزرار بـ aria-pressed؛ نختار أوّلها إن وُجدت، وإلا نتخطّى. (كان المرشّح «كل زر
    // بلا aria-label» يلتقط زر «تسليم» نفسه في سؤال الترتيب الأخير فيسلّم مبكراً.)
    const options = page.locator("button[aria-pressed]:not([aria-label])");
    if ((await options.count()) > 0) await options.first().click();
    if (i < 5) await page.getByRole("button", { name: "السؤال التالي" }).click();
  }
  // في السؤال الأخير يحلّ زر «تسليم» محلّ «التالي».
  await page.getByRole("button", { name: "تسليم", exact: true }).click();

  await page.waitForURL("**/exams/result");
  await expect(page.getByText(/%/).first()).toBeVisible();
  expect(calls.some((c) => c.method === "POST" && c.path === "/rest/v1/exams")).toBe(true);
  await expect
    .poll(() => calls.some((c) => c.method === "POST" && c.path === "/rest/v1/exam_results"))
    .toBe(true);
});
