import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 7.7: «صحة التطبيق» في «المزيد» لصاحب التطبيق وحده.
test("صاحب التطبيق يرى صحة التطبيق، وغيره لا يرى الرابط", async ({ page, context }) => {
  const hour = new Date();
  hour.setMinutes(0, 0, 0);
  await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      is_app_owner: true,
      app_health: {
        status: "ok",
        days: 7,
        errors_24h: 61,
        errors_period: 80,
        users_period: 4,
        hourly: [{ hour: hour.toISOString(), errors: 61 }],
        top: [
          {
            message: "TypeError: boom",
            url: "/today",
            source: "client",
            occurrences: 61,
            users: 3,
            last_seen: hour.toISOString(),
          },
        ],
        alerts: [{ hour: hour.toISOString(), errors: 61, threshold: 50 }],
      },
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/more");
  await page.getByRole("link", { name: /صحة التطبيق/ }).click();
  await expect(page.getByRole("heading", { name: "صحة التطبيق" })).toBeVisible();
  await expect(page.getByText("TypeError: boom")).toBeVisible();
  await expect(page.getByLabel("التنبيهات")).toContainText("الحد 50");
});

test("غير صاحب التطبيق: لا رابط، والشاشة ترفض", async ({ page, context }) => {
  await installFakeSupabase(context, {
    user: STUDENT,
    rpc: { is_app_owner: false, app_health: { status: "not_owner" } },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/more");
  await expect(page.getByRole("heading", { name: "المزيد" })).toBeVisible();
  await expect(page.getByRole("link", { name: /صحة التطبيق/ })).toHaveCount(0);
  await gotoReady(page, "/app-health");
  await expect(page.getByText("هذه الشاشة لصاحب التطبيق وحده.")).toBeVisible();
});
