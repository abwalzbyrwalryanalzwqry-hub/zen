import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

/**
 * تحليل قسم «المزيد» — المرحلة 2 (بنية المعلومات): الضيف بلا تكرار للشريط ومعه الخصوصية والشروط،
 * و/profile يحوّل إلى /account، و«عن زِن» فيه الإصدار المحقون، والإعدادات تُحفظ تلقائياً.
 */
const homeCtx = {
  account_kind: "student",
  is_teacher: false,
  children: 0,
  halaqas_joined: 1,
  halaqas_taught: 0,
  center_staff: false,
};
const prefs = {
  user_id: STUDENT.id,
  push_enabled: true,
  categories: {},
  quiet_start: null,
  quiet_end: null,
  timezone: "Asia/Aden",
  wird_time: null,
  muhasaba_time: null,
};

test("الضيف: «المزيد» بلا تكرار للشريط، ومعه الخصوصية والشروط وعن زِن", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("zen-onboarded", "1");
    localStorage.setItem("zen-guest", "1");
  });
  await gotoReady(page, "/more");
  await expect(page.getByRole("heading", { name: "عن زِن" })).toBeVisible({ timeout: 20_000 });
  for (const name of [/سياسة الخصوصية/, /شروط الاستخدام/, /عن زِن/, /التفضيلات/]) {
    await expect(page.getByRole("link", { name }).first()).toBeVisible();
  }
  // المصحف والاختبارات والمحاسبة في شريط الضيف، فلا تتكرّر في «المزيد» (IA-03).
  await expect(page.getByRole("heading", { name: "على جهازك" })).toHaveCount(0);
});

test("الحساب: /profile يحوّل إلى /account، و«عن زِن» يعرض الإصدار", async ({ page, context }) => {
  await installFakeSupabase(context, {
    user: STUDENT,
    tables: { profiles: [{ id: STUDENT.id, name: STUDENT.name, avatar: null, role: "student" }] },
    rpc: { my_home_context: homeCtx },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/profile");
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { level: 1, name: "الحساب" })).toBeVisible();
  await gotoReady(page, "/about");
  await expect(page.getByText(/^\d+\.\d+\.\d+$/)).toBeVisible();
  await expect(page.getByRole("link", { name: /تراخيص المكتبات/ })).toBeVisible();
});

test("التنبيهات تُحفظ تلقائياً بعد التعديل دون زر حفظ", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    tables: { notification_prefs: [prefs] },
    rpc: { my_home_context: homeCtx },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/settings/notifications");
  const quiet = page.getByRole("switch", { name: /أؤجّل التنبيهات الفورية/ });
  await expect(quiet).not.toBeChecked({ timeout: 20_000 });
  await quiet.click();
  await expect(page.getByRole("status").filter({ hasText: "حُفظ" })).toBeVisible();
  const saved = calls.filter((c) => c.path === "/rest/v1/rpc/set_notification_prefs");
  expect(saved.length).toBe(1);
  expect((saved[0].body as { _quiet_start: string })._quiet_start).toBe("22:00");
});
