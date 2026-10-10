import { expect, test } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

/**
 * تحليل قسم «المزيد» — المرحلة 0 (الإصلاحات الحرجة): الخروج الموحَّد، وعدم الكتابة فوق إعدادات
 * التنبيهات عند فشل جلبها، وتأكيد إزالة طالب من الحلقة.
 */
const S1 = "bbbbbbbb-0000-4000-8000-0000000000c1";
const homeCtx = {
  account_kind: null,
  is_teacher: true,
  children: 0,
  halaqas_joined: 0,
  halaqas_taught: 1,
  center_staff: false,
};
const base = {
  user_roles: [{ user_id: TEACHER.id, role: "teacher" }],
  profiles: [{ id: TEACHER.id, name: TEACHER.name, avatar: null, role: "teacher" }],
};

test("الخروج من صفحة الحساب: نطاق هذا الجهاز، ومسح مفاتيح الحساب، والرجوع لا يعيد الصفحة", async ({
  page,
  context,
}) => {
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: base,
    rpc: { my_home_context: homeCtx },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/account");
  await expect(page.getByText(TEACHER.name).first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("zen-home-mode")))
    .toBe("teacher");
  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "تسجيل الخروج" }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  const logout = calls.find((c) => c.path === "/auth/v1/logout");
  expect(logout?.query).toContain("scope=local");
  expect(await page.evaluate(() => localStorage.getItem("zen-home-mode"))).toBeNull();
  // الخروج يستبدل السجل: لا يعود زر الرجوع إلى صفحة محمية.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/account/);
});

test("فشل جلب إعدادات التنبيهات: رسالة وإعادة، ولا زر حفظ يكتب الافتراضية", async ({
  page,
  context,
}) => {
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: base,
    rpc: { my_home_context: homeCtx },
    fail: { tables: ["notification_prefs"] },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/settings/notifications");
  await expect(page.getByText(/تعذّر تحميل إعدادات تنبيهاتك/)).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  expect(calls.some((c) => c.path === "/rest/v1/rpc/set_notification_prefs")).toBe(false);
});

test("إزالة طالب من الحلقة لا تتم إلا بعد التأكيد", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: {
      ...base,
      profiles: [...base.profiles, { id: S1, name: "أحمد", avatar: null, role: "student" }],
      centers: [{ id: "c1", name: "مركز النور", created_by: TEACHER.id }],
      halaqat: [{ id: "h1", center_id: "c1", name: "حلقة الفجر", teacher_id: TEACHER.id }],
      halaqa_students: [{ halaqa_id: "h1", student_id: S1 }],
    },
    rpc: { my_home_context: homeCtx, my_managed_centers: [] },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/centers");
  await page.getByRole("button", { name: /حلقة الفجر/ }).click();
  const remove = page.getByRole("button", { name: "إزالة أحمد من الحلقة" });
  await remove.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "إلغاء" })).toBeFocused();
  await dialog.getByRole("button", { name: "إلغاء" }).click();
  await expect(dialog).toHaveCount(0);
  const deletes = () =>
    calls.filter((c) => c.method === "DELETE" && c.path === "/rest/v1/halaqa_students").length;
  expect(deletes()).toBe(0);
  await remove.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "إزالة" }).click();
  await expect.poll(deletes).toBe(1);
});

test("إزالة عضو من طاقم المركز: بتأكيد، والفشل يظهر ولا يُبتلع", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: {
      ...base,
      centers: [{ id: "c1", name: "مركز النور", created_by: TEACHER.id }],
      halaqat: [],
      center_staff: [],
    },
    rpc: {
      my_home_context: homeCtx,
      my_managed_centers: [{ center_id: "c1", role: "owner", name: "مركز النور" }],
      center_staff_list: [{ user_id: S1, name: "خالد", role: "supervisor" }],
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/centers");
  await page.getByRole("button", { name: "الطاقم" }).click();
  const remove = page.getByRole("button", { name: "إزالة خالد من الطاقم" });
  await remove.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("إزالة خالد من طاقم المركز؟");
  await dialog.getByRole("button", { name: "إلغاء" }).click();
  const deletes = () =>
    calls.filter((c) => c.method === "DELETE" && c.path === "/rest/v1/center_staff").length;
  expect(deletes()).toBe(0);
  // RLS ترفض بصمت: نجاح بلا صفوف محذوفة. يجب أن يظهر ذلك خطأً لا «تمّت الإزالة».
  await page.route("**/rest/v1/center_staff**", (r) =>
    r.request().method() === "DELETE"
      ? r.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: "[]",
        })
      : r.fallback(),
  );
  await remove.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "إزالة" }).click();
  await expect(page.getByRole("alert")).toContainText("لم تُحذف العضوية");
  expect(deletes()).toBe(0);
});
