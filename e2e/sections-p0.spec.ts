import { expect, test } from "@playwright/test";
import { STUDENT, TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

/**
 * إصلاحات المرحلة P0 من فحص الأقسام الأربعة (الرئيسية، طلابي، المحادثات، المزيد).
 * docs/SECTIONS_AUDIT.md يشرح كل بند.
 */
const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
const today = new Date().toISOString().slice(0, 10);
const S1 = "aaaaaaaa-0000-4000-8000-0000000000a1";
const S2 = "aaaaaaaa-0000-4000-8000-0000000000a2";
const teacherTables = {
  user_roles: [{ user_id: TEACHER.id, role: "teacher" }],
  profiles: [
    { id: S1, name: "أحمد", avatar: null, role: "student" },
    { id: S2, name: "بلال", avatar: null, role: "student" },
  ],
  halaqat: [{ id: "h1", name: "حلقة الفجر", teacher_id: TEACHER.id, created_at: iso(9999) }],
};
const session = (id: string, student: string, minAgo: number) => ({
  id,
  student_id: student,
  halaqa_id: "h1",
  assignment_id: null,
  surah_name: "الملك",
  from_ayah: 1,
  to_ayah: 11,
  kind: "memorize",
  status: "awaiting_teacher",
  audio_path: null,
  duration_seconds: 0,
  session_date: today,
  created_at: iso(minAgo),
  ai_score: null,
  ai_analysis: null,
  transcript: null,
});

test("لوحة المعلم: فشل التحميل يعرض «تعذّر التحميل» وإعادة المحاولة تنجح", async ({
  page,
  context,
}) => {
  let fail = true;
  await installFakeSupabase(context, {
    user: TEACHER,
    tables: { ...teacherTables, recitation_sessions: [] },
    rpc: { my_halaqa_student_ids: [S1] },
  });
  await context.route(/\/rest\/v1\/rpc\/my_halaqa_student_ids/, (r) =>
    fail
      ? r.fulfill({ status: 500, contentType: "application/json", body: '{"message":"boom"}' })
      : r.fallback(),
  );
  await seedSession(context, TEACHER);
  await gotoReady(page, "/teacher");
  await expect(page.getByRole("alert")).toContainText("تعذّر تحميل البيانات", { timeout: 20_000 });
  fail = false;
  await page.getByRole("button", { name: "أعد المحاولة" }).click();
  await expect(page.getByRole("tab", { name: /^التسميعات/ })).toBeVisible();
});

test("تقييم التسميع: كل بطاقة بحالتها، ولا حفظ بلا درجة، والأقدم أولاً", async ({
  page,
  context,
}) => {
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: {
      ...teacherTables,
      // الترتيب الأقدم أولاً يطلبه العميل من الخادم (order=created_at.asc).
      recitation_sessions: [session("rs1", S1, 120), session("rs2", S2, 30)],
    },
    rpc: {
      my_halaqa_student_ids: [S1, S2],
      apply_review: [{ due_date: today, interval_days: 1 }],
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/teacher");

  await expect(page.getByText("سورة الملك · الآيات 1–11").first()).toBeVisible({
    timeout: 20_000,
  });
  const pendingCall = calls.find((c) => c.path === "/rest/v1/recitation_sessions");
  expect(pendingCall?.query ?? "").toContain("created_at.asc");

  // البطاقة: صندوق فيه اسم الطالب ونطاق تسميعه (زر «تقييم التسميع» يصير «إغلاق» عند الفتح).
  const cards = page.locator("div.glass.rounded-3xl").filter({ hasText: "سورة الملك" });
  const first = cards.filter({ hasText: "أحمد" });
  const second = cards.filter({ hasText: "بلال" });

  await first.getByRole("button", { name: "تقييم التسميع" }).click();
  // لا درجة افتراضية: الاعتماد معطَّل حتى يختار المعلّم.
  await expect(first.getByRole("button", { name: "اعتماد" })).toBeDisabled();
  await first.getByRole("button", { name: "ممتاز" }).click();
  await first.getByRole("button", { name: "المدود" }).click();
  await first.getByPlaceholder("ملاحظات المعلم…").fill("ملاحظة أحمد");

  // فتح بطاقة بلال لا يرث درجة أحمد ولا أخطاءه ولا ملاحظاته.
  await second.getByRole("button", { name: "تقييم التسميع" }).click();
  await expect(second.getByPlaceholder("ملاحظات المعلم…")).toHaveValue("");
  await expect(second.getByRole("button", { name: "المدود" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(second.getByRole("button", { name: "اعتماد" })).toBeDisabled();

  await first.getByRole("button", { name: "اعتماد" }).click();
  const saved = () =>
    calls.find((c) => c.path === "/rest/v1/recitation_assessments" && c.method === "POST");
  await expect.poll(() => saved()?.body ?? null).not.toBeNull();
  const body = JSON.stringify(saved()?.body);
  expect(body).toContain("ملاحظة أحمد");
  expect(body).toContain("95");
  // رسالة الحفظ تظهر مرة واحدة أعلى القائمة.
  await expect(page.getByRole("status").filter({ hasText: "حُفظ تقييم أحمد" })).toHaveCount(1);
});

test("إسناد الواجب: السورة من القائمة والنطاق يُتحقَّق منه", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: { ...teacherTables, recitation_sessions: [], assignments: [] },
    rpc: { my_halaqa_student_ids: [S1] },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/teacher");
  await page.getByRole("tab", { name: "الواجبات", exact: true }).click({ timeout: 20_000 });
  const selects = page.locator("select");
  await selects.nth(0).selectOption(S1);
  await selects.nth(2).selectOption("الفاتحة");
  await page.getByLabel("إلى آية").fill("9");
  await page.getByRole("button", { name: /إسناد الواجب/ }).click();
  await expect(page.getByRole("alert")).toContainText("فيها 7 آية");
  expect(calls.some((c) => c.path === "/rest/v1/assignments" && c.method === "POST")).toBe(false);

  await page.getByLabel("إلى آية").fill("7");
  await page.getByRole("button", { name: /إسناد الواجب/ }).click();
  await expect(page.getByRole("status")).toContainText("تم إسناد الواجب");
});

test("المحادثات: فشل التحميل لا يُعرض «لا محادثات»، ونص الفراغ حسب الدور، والمساعد يتبع مفتاحه", async ({
  page,
  context,
}) => {
  let fail = true;
  await installFakeSupabase(context, {
    user: TEACHER,
    tables: {
      ...teacherTables,
      feature_flags: [{ key: "assistant", enabled: false, rollout: 100, note: null }],
    },
    rpc: {
      my_home_context: {
        account_kind: null,
        is_teacher: true,
        children: 0,
        halaqas_joined: 0,
        halaqas_taught: 1,
        center_staff: false,
      },
      my_inbox: [],
      my_rooms: [],
    },
  });
  await context.route(/\/rest\/v1\/rpc\/my_inbox/, (r) =>
    fail
      ? r.fulfill({ status: 500, contentType: "application/json", body: '{"message":"boom"}' })
      : r.fallback(),
  );
  await seedSession(context, TEACHER);
  await gotoReady(page, "/chats");
  await expect(page.getByRole("alert")).toContainText("تعذّر تحميل البيانات", { timeout: 20_000 });
  await expect(page.getByText("لا توجد محادثات بعد")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "أعد المحاولة" }).click();
  await expect(page.getByText("ابدأ محادثة مع طلابك أو أولياء أمورهم")).toBeVisible();
  // «محادثة جديدة» في الرأس لا زراً عائماً فوق القائمة.
  await expect(page.locator("header").getByRole("link", { name: "محادثة جديدة" })).toBeVisible();
  // مفتاح المساعد معطَّل: لا بطاقة له.
  await expect(page.locator('a[href="/assistant"]')).toHaveCount(0);
});

test("رئيسية الطالب: روابط القصص والتسميع الذاتي تتبع مفاتيح الميزات والتاريخ منسَّق", async ({
  page,
  context,
}) => {
  await installFakeSupabase(context, {
    user: STUDENT,
    tables: {
      feature_flags: [
        { key: "stories", enabled: false, rollout: 100, note: null },
        { key: "recite", enabled: false, rollout: 100, note: null },
      ],
      assignments: [
        {
          id: "a1",
          student_id: STUDENT.id,
          teacher_id: TEACHER.id,
          halaqa_id: null,
          kind: "memorize",
          surah_name: "الملك",
          from_ayah: 1,
          to_ayah: 10,
          instructions: null,
          due_date: today,
          status: "pending",
          created_at: iso(60),
        },
      ],
    },
    rpc: {
      my_home_context: {
        account_kind: "student",
        is_teacher: false,
        children: 0,
        halaqas_joined: 0,
        halaqas_taught: 0,
        center_staff: false,
      },
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/today");
  await expect(page.getByText("سورة الملك · الآيات 1–10")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("موعد التسليم: اليوم")).toBeVisible();
  await expect(page.locator('a[href="/stories"]')).toHaveCount(0);
  await expect(page.locator('a[href="/recite"]')).toHaveCount(0);
});
