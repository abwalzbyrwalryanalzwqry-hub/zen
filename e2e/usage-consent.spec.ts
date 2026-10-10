import { expect, test } from "@playwright/test";
import { gotoReady, installFakeSupabase, seedSession, STUDENT } from "./fake-supabase";

// 13.4: الموافقة معطّلة افتراضياً، ولا تُفعَّل دون إقرار 13+، والمالك وحده يرى اللوحة.
test("موافقة الإحصاءات بإقرار العمر، ولوحة المالك", async ({ page, context }) => {
  let consent = { granted: false, age_13_plus: false, eligible: true };
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      my_analytics_consent: () => consent,
      set_analytics_consent: (b: unknown) => {
        const a = b as { _granted: boolean; _age_13_plus: boolean };
        consent = {
          granted: a._granted && a._age_13_plus,
          age_13_plus: a._age_13_plus,
          eligible: true,
        };
        return consent;
      },
      am_app_owner: true,
      usage_summary: {
        days: 30,
        consented: 4,
        accounts: 10,
        rows: [
          { day: "2026-10-02", event: "app_open", platform: "android", count: 3 },
          { day: "2026-10-01", event: "mushaf_open", platform: "android", count: 2 },
        ],
      },
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/settings/display");
  const region = page.getByRole("region", { name: "إحصاءات الاستخدام" });
  const sw = region.getByRole("switch", { name: "مشاركة إحصاءات مجمّعة" });
  await expect(sw).not.toBeChecked({ timeout: 20_000 });
  await expect(sw).toBeDisabled();
  await region.getByRole("checkbox", { name: "عمري 13 سنة أو أكثر" }).check();
  await sw.click();
  await expect(sw).toBeChecked();
  const set = calls.filter((c) => c.path.includes("set_analytics_consent"));
  expect(set.at(-1)?.body).toMatchObject({ _granted: true, _age_13_plus: true });

  await region.getByRole("link", { name: /لوحة الاستخدام/ }).click();
  await expect(page.getByRole("heading", { name: "لوحة الاستخدام" })).toBeVisible();
  await expect(page.getByText("موافقون: 4 من 10 حساباً")).toBeVisible();
  await expect(page.getByText("فتح التطبيق")).toBeVisible();
  await expect(page.getByText("فتح المصحف")).toBeVisible();
});

test("طالب مرتبط بوليّ أمر: لا خيار تتبّع", async ({ page, context }) => {
  await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      my_analytics_consent: { granted: false, age_13_plus: false, eligible: false },
      am_app_owner: false,
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/settings/display");
  const region = page.getByRole("region", { name: "إحصاءات الاستخدام" });
  await expect(region.getByText("حسابك مرتبط بوليّ أمر")).toBeVisible({ timeout: 20_000 });
  await expect(region.getByRole("switch")).toHaveCount(0);
  await expect(region.getByRole("link")).toHaveCount(0);
});
