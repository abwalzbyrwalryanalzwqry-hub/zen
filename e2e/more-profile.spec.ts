import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

/**
 * تحليل قسم «المزيد» — المرحلة 4ج: الصورة الشخصية والحسابات على هذا الجهاز.
 */
const homeCtx = {
  account_kind: "student",
  is_teacher: false,
  children: 0,
  halaqas_joined: 1,
  halaqas_taught: 0,
  center_staff: false,
};
// PNG شفاف 1×1.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test("الصورة الشخصية: تظهر في «المزيد»، والرفع إلى مجلد المستخدم ثم حفظ الرابط", async ({
  page,
  context,
}) => {
  const avatar = `http://sb.e2e.test/storage/v1/object/public/avatars/${STUDENT.id}/old.webp`;
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    rpc: { my_home_context: homeCtx },
    tables: { profiles: [{ id: STUDENT.id, name: STUDENT.name, avatar, role: "student" }] },
  });
  await page.route("**/storage/v1/object/public/avatars/**", (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: PNG }),
  );
  await seedSession(context, STUDENT);
  await gotoReady(page, "/more");
  await expect(page.getByTestId("user-avatar-img").first()).toBeVisible({ timeout: 20_000 });

  await page.goto("/account");
  await expect(page.getByRole("button", { name: "تغيير الصورة الشخصية" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByTestId("avatar-input").setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(page.getByText("حُفظت الصورة الشخصية.")).toBeVisible();
  const up = calls.find(
    (c) => c.method === "POST" && c.path.startsWith(`/storage/v1/object/avatars/${STUDENT.id}/`),
  );
  expect(up?.path).toMatch(/\/[0-9a-f]{24}\.(webp|jpg)$/);
  const patch = calls.find((c) => c.method === "PATCH" && c.path === "/rest/v1/profiles");
  expect(String((patch?.body as { avatar?: string })?.avatar)).toContain(
    `/storage/v1/object/public/avatars/${STUDENT.id}/`,
  );
  // القديمة تُحذف من المجلد نفسه بعد نجاح الجديدة.
  const del = calls.find(
    (c) => c.method === "DELETE" && c.path.startsWith("/storage/v1/object/avatars"),
  );
  expect(JSON.stringify(del?.body)).toContain(`${STUDENT.id}/old.webp`);
});

test("التبديل إلى حساب محفوظ: خروج ثم الدخول باسم المستخدم مملوءاً", async ({ page, context }) => {
  await installFakeSupabase(context, { user: STUDENT, rpc: { my_home_context: homeCtx } });
  await context.addInitScript(() => {
    if (!localStorage.getItem("zen-recent-accounts"))
      localStorage.setItem(
        "zen-recent-accounts",
        JSON.stringify([{ userId: "other-1", username: "omar_q", name: "عمر", at: 1 }]),
      );
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/account");
  const section = page.getByRole("region", { name: "الحسابات على هذا الجهاز" });
  await expect(section).toBeVisible({ timeout: 20_000 });
  await section.getByRole("button", { name: "التبديل إلى عمر" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "تبديل" }).click();
  await expect(page).toHaveURL(/\/auth\/login\?u=omar_q/);
  await expect(page.locator("input").first()).toHaveValue("omar_q");
});
