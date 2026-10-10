import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase } from "./fake-supabase";

test.describe("الدخول", () => {
  test("المسار المحمي يعيد غير المسجَّل إلى شاشة الدخول", async ({ page, context }) => {
    await installFakeSupabase(context, { user: null });
    await page.goto("/today");
    await page.waitForURL("**/auth/login");
  });

  test("كلمة مرور خاطئة تُظهر رسالة عربية ولا تُدخل", async ({ page, context }) => {
    await installFakeSupabase(context, { user: STUDENT, rejectLogin: true });
    await gotoReady(page, "/auth/login");
    await page.locator("#zen-username").fill("ahmad_1");
    await page.locator("#zen-password").fill("wrong-pass");
    await page.getByRole("button", { name: "دخول", exact: true }).click();
    await expect(page.getByText(/غير صحيحة/)).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("صفحات الهاتف والبريد القديمة حُذفت (L1): صفحة «غير موجودة» ثم الدخول باسم المستخدم", async ({
    page,
    context,
  }) => {
    await installFakeSupabase(context, { user: null });
    for (const old of ["/auth/phone", "/auth/email", "/auth/otp"]) {
      await page.goto(old);
      await expect(page.getByRole("heading", { name: "الصفحة غير موجودة" })).toBeVisible();
    }
    await gotoReady(page, "/auth/login");
    await expect(page.getByPlaceholder("name@example.com")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /متابعة دون حساب/ })).toBeVisible();
  });

  test("إنشاء حساب باسم مستخدم يعرض رمز الاسترداد ثم يدخل", async ({ page, context }) => {
    const { calls } = await installFakeSupabase(context, {
      user: STUDENT,
      rpc: {
        register_username_account: { username: "ahmad_1", recovery_code: "ABCD-EFGH-JKMN-PQRS" },
      },
    });
    await gotoReady(page, "/auth/login");
    await page.getByRole("tab", { name: "إنشاء حساب" }).click();
    await page.locator("#zen-name").fill("أحمد");
    await page.locator("#zen-username").fill("Ahmad_1");
    await page.locator("#zen-password").fill("secret-pass1");
    await page.locator("#zen-password2").fill("secret-pass1");
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(page.getByTestId("recovery-code")).toHaveText("ABCD-EFGH-JKMN-PQRS");
    await expect(page.getByTestId("new-username")).toHaveText("ahmad_1");
    const reg = calls.find((c) => c.path === "/rest/v1/rpc/register_username_account");
    expect(reg?.body).toMatchObject({ _username: "ahmad_1", _password: "secret-pass1" });
    const login = calls.find((c) => c.path === "/auth/v1/token");
    expect(login?.body).toMatchObject({
      email: "e0f254fd64d099e6e86ff329a55e3867@users.zen.invalid",
    });
    await page.getByText("حفظت الرمز في مكان آمن").click();
    await page.getByRole("button", { name: "متابعة", exact: true }).click();
    await page.waitForURL("**/today");
  });

  test("الدخول باسم المستخدم يفتح «واجب اليوم» ببيانات الطالب", async ({ page, context }) => {
    const { calls } = await installFakeSupabase(context, {
      user: STUDENT,
      tables: {
        assignments: [
          {
            id: "a1",
            student_id: STUDENT.id,
            teacher_id: "t",
            halaqa_id: null,
            kind: "new",
            surah_name: "الملك",
            from_ayah: 1,
            to_ayah: 5,
            due_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
            status: "pending",
            notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
    });
    await gotoReady(page, "/auth/login");
    await page.locator("#zen-username").fill("Ahmad_1");
    await page.locator("#zen-password").fill("secret123");
    await page.getByRole("button", { name: "دخول", exact: true }).click();
    await page.waitForURL("**/today");
    await expect(page.getByRole("heading", { name: "واجب اليوم" })).toBeVisible();
    await expect(page.getByText("الملك").first()).toBeVisible();
    const login = calls.find((c) => c.path === "/auth/v1/token");
    expect(login?.body).toMatchObject({
      email: "e0f254fd64d099e6e86ff329a55e3867@users.zen.invalid",
    });
  });
});
