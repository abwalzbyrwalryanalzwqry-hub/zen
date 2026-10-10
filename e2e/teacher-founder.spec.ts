import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// «أنا معلّم»: حساب جديد بلا دور يفعّل دور المعلم برمز المؤسس من الصفحة الرئيسية،
// فيُنقل لإنشاء مركزه الأول. قاعدة البيانات هي من يمنح الدور (activate_teacher_role).
test("أول معلّم يفعّل دوره برمز المؤسس من «أنا معلّم» ثم يُنقل لإنشاء مركزه", async ({
  page,
  context,
}) => {
  let isTeacher = false;
  const codes: string[] = [];
  await installFakeSupabase(context, {
    user: STUDENT,
    tables: { profiles: [{ id: STUDENT.id, name: "المؤسس", role: "student" }] },
    rpc: {
      my_home_context: () => ({
        account_kind: null,
        is_teacher: isTeacher,
        children: 0,
        halaqas_joined: 0,
        halaqas_taught: 0,
        center_staff: false,
      }),
      activate_teacher_role: (b: unknown) => {
        const code = (b as { _code: string })._code;
        codes.push(code);
        if (code.replace(/[^A-Z0-9]/gi, "").toUpperCase() === "ZENABCDE12345FFFFF00000") {
          isTeacher = true;
          return "founder";
        }
        return "invalid";
      },
    },
  });
  await seedSession(context, STUDENT);

  await gotoReady(page, "/today");
  await expect(page.getByRole("heading", { name: "كيف ستستخدم زِن؟" })).toBeVisible();
  await page.getByRole("button", { name: /أنا معلّم/ }).click();

  const field = page.getByLabel("رمز الدعوة أو رمز المؤسس");
  await field.fill("wrong-code");
  await page.getByRole("button", { name: "تفعيل" }).click();
  await expect(page.getByRole("alert")).toContainText("الرمز غير صحيح");

  await field.fill("zen-abcde-12345-fffff-00000");
  await page.getByRole("button", { name: "تفعيل" }).click();
  await expect(page).toHaveURL(/\/centers/);
  expect(codes).toEqual(["WRONG-CODE", "ZEN-ABCDE-12345-FFFFF-00000"]);
});

// صاحب التطبيق يرى رمز المؤسس داخل التطبيق ويفعّل دوره بلمسة، دون فتح قاعدة البيانات.
test("صاحب التطبيق يرى رمز المؤسس في «أنا معلّم» ويفعّل دوره بلمسة", async ({ page, context }) => {
  let isTeacher = false;
  const codes: string[] = [];
  await installFakeSupabase(context, {
    user: STUDENT,
    tables: { profiles: [{ id: STUDENT.id, name: "المؤسس", role: "student" }] },
    rpc: {
      my_home_context: () => ({
        account_kind: null,
        is_teacher: isTeacher,
        children: 0,
        halaqas_joined: 0,
        halaqas_taught: 0,
        center_staff: false,
      }),
      founder_code_for_me: () =>
        isTeacher
          ? { status: "already" }
          : { status: "owner", code: "ZEN-ABCDE-12345-FFFFF-00000" },
      activate_teacher_role: (b: unknown) => {
        codes.push((b as { _code: string })._code);
        isTeacher = true;
        return "founder";
      },
    },
  });
  await seedSession(context, STUDENT);

  await gotoReady(page, "/today");
  await page.getByRole("button", { name: /أنا معلّم/ }).click();
  await expect(page.getByText("أنت صاحب التطبيق — هذا رمز المؤسس")).toBeVisible();
  await expect(page.getByTestId("zen-founder-code")).toHaveText("ZEN-ABCDE-12345-FFFFF-00000");
  await page.getByRole("button", { name: "فعّلني مؤسساً الآن" }).click();
  await expect(page).toHaveURL(/\/centers/);
  expect(codes).toEqual(["ZEN-ABCDE-12345-FFFFF-00000"]);
});

// غير صاحب التطبيق لا يرى أي رمز.
test("غير صاحب التطبيق لا يرى رمز المؤسس", async ({ page, context }) => {
  await installFakeSupabase(context, {
    user: STUDENT,
    tables: { profiles: [{ id: STUDENT.id, name: "طالب", role: "student" }] },
    rpc: {
      my_home_context: () => ({
        account_kind: null,
        is_teacher: false,
        children: 0,
        halaqas_joined: 0,
        halaqas_taught: 0,
        center_staff: false,
      }),
      founder_code_for_me: () => ({ status: "not_owner" }),
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/today");
  await page.getByRole("button", { name: /أنا معلّم/ }).click();
  await expect(page.getByLabel("رمز الدعوة أو رمز المؤسس")).toBeVisible();
  await expect(page.getByTestId("zen-founder-code")).toHaveCount(0);
});
