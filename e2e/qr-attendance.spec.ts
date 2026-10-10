import { expect, test } from "@playwright/test";
import { STUDENT, TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 9.2: المعلّم يعرض رمزاً متجدّداً، والطالب يكتب الأرقام (المسح بالكاميرا في Android فقط).
test("رمز الحضور: QR وأرقام تتجدّد", async ({ page, context }) => {
  let n = 0;
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: {
      halaqat: [
        {
          id: "h1",
          center_id: "c1",
          name: "حلقة الفجر",
          teacher_id: TEACHER.id,
          schedule: null,
          created_at: "2026-01-01",
        },
      ],
    },
    rpc: {
      issue_attendance_code: () => ({
        code: String(123450 + ++n),
        halaqa_id: "h1",
        expires_at: new Date(Date.now() + 7_000).toISOString(),
      }),
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/teacher/attendance-code");
  await expect(page.getByLabel("أرقام الرمز")).toHaveText("123451", { timeout: 20_000 });
  await expect(page.getByRole("img", { name: "رمز QR للحضور" }).locator("svg")).toBeVisible();
  // يتجدّد قبل انتهائه (5 ثوانٍ على الأقل بين رمزين).
  await expect(page.getByLabel("أرقام الرمز")).toHaveText("123452", { timeout: 10_000 });
  expect(calls.filter((c) => c.path === "/rest/v1/rpc/issue_attendance_code")[0].body).toEqual({
    _halaqa: "h1",
  });
});

test("سجّل حضورك: كتابة الأرقام، والرمز المنتهي برسالة واضحة", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      check_in: (b: unknown) =>
        (b as { _code: string })._code === "123456"
          ? { status: "checked_in", attendance: "present", halaqa: "حلقة الفجر" }
          : { status: "invalid" },
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/check-in");
  // لا زر مسح خارج Android.
  await expect(page.getByRole("button", { name: /امسح/ })).toHaveCount(0);
  const input = page.getByLabel(/اكتب الأرقام الستة/);
  await input.fill("111111");
  await page.getByRole("button", { name: "تسجيل الحضور" }).click();
  await expect(page.getByRole("alert")).toContainText("منتهٍ أو غير صحيح");
  await input.fill("123 456");
  await page.getByRole("button", { name: "تسجيل الحضور" }).click();
  await expect(page.getByRole("status")).toContainText("سُجّل حضورك في حلقة الفجر");
  expect(calls.filter((c) => c.path === "/rest/v1/rpc/check_in").map((c) => c.body)).toEqual([
    { _code: "111111" },
    { _code: "123456" },
  ]);
});
