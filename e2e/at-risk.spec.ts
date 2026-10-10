import { expect, test } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 9.4: بطاقة الإنذار في رئيسية المعلّم ⇒ القائمة بالأسباب ⇒ رسالة وليّ الأمر وخطة المراجعة.
test("الإنذار المبكر: البطاقة والأسباب والرسالة", async ({ page, context }) => {
  await installFakeSupabase(context, {
    user: TEACHER,
    tables: { profiles: [{ id: TEACHER.id, name: "المعلّم", role: "teacher" }] },
    rpc: {
      my_home_context: () => ({
        account_kind: "teacher",
        is_teacher: true,
        children: 0,
        halaqas_joined: 0,
        halaqas_taught: 1,
        center_staff: false,
      }),
      at_risk_students: [
        {
          student_id: "s1",
          name: "أحمد",
          halaqa_id: "h1",
          halaqa_name: "حلقة الفجر",
          reasons: ["absences", "overdue"],
          absences: 3,
          avg_score: 60,
          overdue: 28,
          inactive_days: 3,
          has_guardian: false,
        },
      ],
    },
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await seedSession(context, TEACHER);
  await gotoReady(page, "/today");
  const card = page.getByRole("link", { name: "1 طلاب يحتاجون متابعة" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.click();
  await expect(page.getByRole("heading", { name: "يحتاجون متابعة" })).toBeVisible();
  const row = page.locator('[data-student="s1"]');
  await expect(row).toContainText("غاب 3 مرات متتالية");
  await expect(row).toContainText("28 مقطعاً متأخراً");
  await row.getByRole("button", { name: "خطة مراجعة" }).click();
  await expect(row).toContainText("مراجعة 3 مقاطع يومياً");
  await row.getByRole("button", { name: "رسالة لوليّ الأمر" }).click();
  await expect(row).toContainText("لا وليّ أمر مربوط");
  await expect(row.locator("pre")).toContainText("تغيّب عن الحلقة 3 مرات");
  await expect(row.locator("pre")).not.toContainText("60");
  await row.getByRole("button", { name: "مشاركة الرسالة" }).click();
  await expect(row.getByRole("status")).toHaveText("نُسخت الرسالة.");
});
