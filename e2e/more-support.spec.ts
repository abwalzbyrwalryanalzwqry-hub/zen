import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

/**
 * تحليل قسم «المزيد» — المرحلة 4ب: المساعدة والدعم (الإبلاغ، الأسئلة المتكررة، ما الجديد، المشاركة).
 */
const homeCtx = {
  account_kind: "student",
  is_teacher: false,
  children: 0,
  halaqas_joined: 1,
  halaqas_taught: 0,
  center_staff: false,
};

test("الإبلاغ: يرسل النوع والنص مع الإصدار والصفحة دون الاستعلام", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    rpc: { my_home_context: homeCtx },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/feedback?from=%2Fsettings%3Ftoken%3Dabc");
  const send = page.getByRole("button", { name: "إرسال" });
  await expect(send).toBeDisabled({ timeout: 20_000 });
  await page.getByRole("radio", { name: "اقتراح" }).click();
  await expect(page.getByRole("radio", { name: "اقتراح" })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("ما اقتراحك؟").fill("وضع ليلي للمصحف بلون أدفأ");
  await send.click();
  await expect(page.getByRole("status").filter({ hasText: "وصلت رسالتك" })).toBeVisible();
  const post = calls.find((c) => c.method === "POST" && c.path === "/rest/v1/feedback");
  const body = (Array.isArray(post?.body) ? post?.body[0] : post?.body) as Record<string, unknown>;
  expect(body).toMatchObject({
    kind: "idea",
    message: "وضع ليلي للمصحف بلون أدفأ",
    route: "/settings",
    locale: "ar",
    platform: "web",
  });
  expect(typeof body.app_version).toBe("string");
});

test("«المزيد»: الدعم فيه الأسئلة وما الجديد بنقطة «جديد» تختفي بعد فتحه", async ({
  page,
  context,
}) => {
  await installFakeSupabase(context, { user: STUDENT, rpc: { my_home_context: homeCtx } });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/more");
  const support = page.getByRole("region", { name: "المساعدة والدعم" });
  await expect(support).toBeVisible({ timeout: 20_000 });
  await expect(support.getByRole("button", { name: "شارك زِن" })).toBeVisible();
  const whatsNew = support.getByRole("link", { name: /ما الجديد/ });
  await expect(whatsNew.getByTestId("more-new")).toBeVisible();
  await whatsNew.click();
  await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("الإصدار");
  await page.goBack();
  await expect(page.getByRole("link", { name: /الأسئلة المتكررة/ })).toBeVisible();
  await expect(page.getByTestId("more-new")).toHaveCount(0);

  await page.getByRole("link", { name: /الأسئلة المتكررة/ }).click();
  const q = page.getByText("هل يعمل زِن دون إنترنت؟");
  await q.click();
  await expect(page.getByText(/المصحف كاملاً والمحاسبة/)).toBeVisible();
});
