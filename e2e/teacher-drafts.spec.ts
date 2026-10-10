import { expect, test } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

const SID = "aaaaaaaa-0000-4000-8000-000000000123";

// المرحلة 12.3: مسودّة رسالة وليّ الأمر تُحرَّر ولا تُرسل إلا بـ«مشاركة».
test("مسودّات مساعد المعلّم", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: {
      user_roles: [{ user_id: TEACHER.id, role: "teacher" }],
      profiles: [{ id: SID, name: "أحمد" }],
    },
    functions: {
      "zen-tools": (b: unknown) => {
        const action = (b as { action: string }).action;
        if (action === "draft_guardian_note")
          return { text: "السلام عليكم ورحمة الله،\nنشكر أحمد على حضوره.", ai: true, draft: true };
        if (action === "draft_week_plan")
          return { text: "السبت: مراجعة الملك 1-5", ai: true, draft: true };
        return { facts: { days: 7 }, text: "", ai: false };
      },
    },
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await seedSession(context, TEACHER);
  await gotoReady(page, `/quran/student/${SID}`);
  const box = page.getByRole("region", { name: "مساعد المعلّم" });
  await box.getByRole("button", { name: "مسودّة رسالة لوليّ الأمر" }).click({ timeout: 20_000 });
  const ta = box.getByLabel(/مسودّة رسالة لوليّ الأمر/);
  await expect(ta).toHaveValue(/نشكر أحمد/);
  // لم يُرسل شيء بعد: نداء واحد لإعداد المسودّة فقط.
  const toolCalls = () => calls.filter((c) => c.path === "/functions/v1/zen-tools");
  expect(toolCalls()).toHaveLength(1);
  await ta.fill("السلام عليكم، نشكر أحمد ونرجو تشجيعه.");
  await box.getByRole("button", { name: "مشاركة" }).click();
  await expect(box.getByRole("status")).toHaveText("نُسخت المسودّة.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "السلام عليكم، نشكر أحمد ونرجو تشجيعه.",
  );
  expect(toolCalls()).toHaveLength(1);

  await box.getByRole("button", { name: "مسودّة خطة الأسبوع" }).click();
  await expect(box.getByLabel(/مسودّة خطة الأسبوع/)).toHaveValue("السبت: مراجعة الملك 1-5");
  expect(toolCalls().map((c) => (c.body as { action: string }).action)).toEqual([
    "draft_guardian_note",
    "draft_week_plan",
  ]);
});

// إصلاح: «طلابي» وملف الطالب كانا متداخلين تحت /quran بلا Outlet فيظهر «تقدّمك في الحفظ» بدلهما.
test("صفحتا طلابي وملف الطالب تُعرضان لا صفحة الحفظ", async ({ page, context }) => {
  await installFakeSupabase(context, {
    user: TEACHER,
    tables: { user_roles: [{ user_id: TEACHER.id, role: "teacher" }] },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/quran/students");
  await expect(page.getByRole("heading", { name: "طلابي" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("تقدّمك في الحفظ")).toHaveCount(0);
  await gotoReady(page, `/quran/student/${SID}`);
  await expect(page.getByRole("region", { name: "مساعد المعلّم" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("تقدّمك في الحفظ")).toHaveCount(0);
});
