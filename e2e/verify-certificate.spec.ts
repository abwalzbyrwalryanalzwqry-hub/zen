import { expect, test } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 10.2: التحقق من شهادة برمزها داخل التطبيق.
test("التحقق من شهادة: صحيحة ثم غير صالحة", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    rpc: {
      verify_certificate: (b: unknown) =>
        (b as { _code: string })._code === "ABCDEFGH23456789"
          ? {
              status: "valid",
              student_name: "عمر بن خالد",
              juz: 30,
              halaqa_name: "حلقة الفجر",
              center_name: "مركز النور",
              teacher_name: "الشيخ أحمد",
              decided_at: "2026-09-20T08:00:00Z",
              serial: "A1B2C3D4E5",
            }
          : { status: "invalid" },
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/verify");
  const input = page.getByLabel("أو اكتب رمز التحقق المطبوع أسفل الشهادة");
  await input.fill("abcd-efgh-2345-678");
  await page.getByRole("button", { name: "تحقّق" }).click();
  await expect(page.getByRole("alert")).toContainText("16 حرفاً");
  await input.fill("abcd-efgh-2345-6789");
  await page.getByRole("button", { name: "تحقّق" }).click();
  const card = page.getByRole("region", { name: "نتيجة التحقق" });
  await expect(card).toContainText("شهادة صحيحة ومعتمدة");
  await expect(card).toContainText("عمر بن خالد");
  await expect(card).toContainText("مركز النور");
  expect(calls.find((c) => c.path === "/rest/v1/rpc/verify_certificate")?.body).toEqual({
    _code: "ABCDEFGH23456789",
  });
  await input.fill("ZZZZ-ZZZZ-ZZZZ-ZZZZ");
  await page.getByRole("button", { name: "تحقّق" }).click();
  await expect(card).toContainText("شهادة غير صالحة");
});
