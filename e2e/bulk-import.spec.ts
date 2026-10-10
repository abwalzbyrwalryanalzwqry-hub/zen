import { expect, test } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 9.3: CSV يُقرأ على الجهاز، ومعاينة بالأخطاء، وإرسال الصالح فقط، ونتيجة كل صف، وبطاقات الدخول.
test("استيراد الطلاب: معاينة ثم إنشاء الصالح فقط", async ({ page, context }) => {
  const H = "aaaa0000-0000-4000-8000-000000000001";
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: {
      halaqat: [
        {
          id: H,
          center_id: "c1",
          name: "حلقة الفجر",
          teacher_id: TEACHER.id,
          schedule: null,
          created_at: "2026-01-01",
        },
      ],
    },
    rpc: {
      teacher_create_students_bulk: {
        created: 1,
        failed: 1,
        rows: [
          {
            row: 1,
            ok: true,
            name: "أحمد علي",
            username: "احمد_علي",
            student_id: "n1",
            recovery_code: "RC-1",
          },
          { row: 2, ok: false, name: "بلال", username: "bilal_s", error: "username_taken" },
        ],
      },
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/teacher/import?halaqa=${H}`);
  await expect(page.getByRole("heading", { name: "استيراد الطلاب" })).toBeVisible();
  await page.getByLabel("ملف الطلاب").setInputFiles({
    name: "students.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("\uFEFFالاسم,اسم المستخدم\nأحمد علي,\nبلال,bilal_s\nب,\n", "utf8"),
  });
  const preview = page.getByRole("region", { name: "المعاينة" });
  await expect(preview).toContainText("2 جاهز · 1 فيه خطأ");
  await expect(preview.locator('[data-line="4"]')).toContainText("الاسم ناقص");
  await page.getByRole("button", { name: /إنشاء الحسابات \(2\) في حلقة الفجر/ }).click();
  await expect(page.getByRole("status")).toContainText("الحسابات المنشأة: 1 · تعذّر: 1");
  await expect(page.getByText("بلال (bilal_s): اسم المستخدم مأخوذ")).toBeVisible();
  await expect(page.getByRole("button", { name: /طباعة بطاقات الدخول/ })).toBeVisible();
  const body = calls.find((c) => c.path === "/rest/v1/rpc/teacher_create_students_bulk")?.body as {
    _halaqa: string;
    _rows: Array<{ name: string; username: string; password: string }>;
  };
  expect(body._halaqa).toBe(H);
  expect(body._rows.map((r) => [r.name, r.username])).toEqual([
    ["أحمد علي", "احمد_علي"],
    ["بلال", "bilal_s"],
  ]);
  expect(body._rows.every((r) => r.password.length >= 8)).toBe(true);
});
