import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

/**
 * المرحلة P3 من فحص الأقسام: نصوص الأقسام الأربعة من القاموس (t) مع بقاء العربية كما هي،
 * وتسميات الوصول للعدّادات والمؤشرات.
 */
test("الرئيسية للطالب: تسمية زر الإشعارات بالعدد من الخادم، والاختصارات والعناوين من القاموس", async ({
  page,
  context,
}) => {
  await installFakeSupabase(context, {
    user: STUDENT,
    tables: {
      notifications: Array.from({ length: 12 }, (_, i) => ({
        id: `n${i}`,
        user_id: STUDENT.id,
        read: false,
        title: "إشعار",
        created_at: new Date(Date.now() - i * 60_000).toISOString(),
      })),
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/today");
  await expect(page.getByRole("link", { name: "الإشعارات، 12 غير مقروء" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { name: "واجب اليوم" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "اختصارات" });
  await expect(nav.getByRole("link", { name: /اختبارات الحفظ/ })).toBeVisible();
  await expect(page.getByText("لا توجد واجبات بعد. سيضيفها معلمك قريباً.")).toBeVisible();
});

test("المحادثات: العنوان والبحث وزر «محادثة جديدة» بتسميات من القاموس", async ({
  page,
  context,
}) => {
  await installFakeSupabase(context, { user: STUDENT });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/chats");
  await expect(page.getByRole("heading", { name: "المحادثات" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByPlaceholder("ابحث بكلمة مفتاحية في المحادثات والرسائل…")).toBeVisible();
  await page.getByRole("link", { name: "محادثة جديدة" }).click();
  await expect(page).toHaveURL(/\/chats\/new/);
  await expect(page.getByRole("heading", { name: "محادثة جديدة" })).toBeVisible();
});
