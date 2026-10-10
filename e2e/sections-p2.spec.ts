import { expect, test } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

/**
 * المرحلة P2 من فحص الأقسام (docs/SECTIONS_AUDIT.md): الترابط بين الأقسام — جهات الاتصال بصلتها،
 * واجب لكل الحلقة، إجراءات صفحة الطالب، إجراءات الحلقة الجارية، وعدد الإشعارات من الخادم.
 */
const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
const S1 = "cccccccc-0000-4000-8000-0000000000c1";
const S2 = "cccccccc-0000-4000-8000-0000000000c2";
const G1 = "cccccccc-0000-4000-8000-0000000000d1";
const homeCtx = {
  account_kind: null,
  is_teacher: true,
  children: 0,
  halaqas_joined: 0,
  halaqas_taught: 1,
  center_staff: false,
};
const tables = {
  user_roles: [{ user_id: TEACHER.id, role: "teacher" }],
  profiles: [
    { id: S1, name: "أحمد", avatar: null, role: "student" },
    { id: S2, name: "بلال", avatar: null, role: "student" },
  ],
  halaqat: [{ id: "h1", name: "حلقة الفجر", teacher_id: TEACHER.id, created_at: iso(9999) }],
  halaqa_students: [
    { halaqa_id: "h1", student_id: S1 },
    { halaqa_id: "h1", student_id: S2 },
  ],
  recitation_sessions: [],
};
const rpc = {
  my_home_context: homeCtx,
  my_halaqa_student_ids: [S1, S2],
  at_risk_students: [],
  teacher_home_kpis: {
    students: 2,
    pending_recitations: 0,
    attendance_marked: 0,
    attendance_present: 0,
    due_assignments: 0,
    at_risk: 0,
  },
};

test("محادثة جديدة: الجهات مجمَّعة بصلتها، ووليّ الأمر موصوف باسم ابنه", async ({
  page,
  context,
}) => {
  await installFakeSupabase(context, {
    user: TEACHER,
    tables,
    rpc: {
      ...rpc,
      my_chat_contacts_detailed: [
        { id: S1, name: "أحمد", avatar: null, relation: "my_student", via: null },
        { id: S2, name: "بلال", avatar: null, relation: "my_student", via: null },
        { id: G1, name: "أبو خالد", avatar: null, relation: "student_guardian", via: "أحمد" },
      ],
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/chats/new");
  await expect(page.getByRole("heading", { name: "طلابي · 2" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "أولياء أمور طلابي · 1" })).toBeVisible();
  await expect(page.getByText("وليّ أمر أحمد")).toBeVisible();
  // «معلم/طالب» القديمة لا تظهر لوليّ الأمر.
  await expect(page.getByRole("button", { name: /أبو خالد/ })).not.toContainText("طالب في حلقتك");
});

test("محادثة جديدة: قبل نشر الدالة الجديدة تعمل القائمة القديمة", async ({ page, context }) => {
  await installFakeSupabase(context, {
    user: TEACHER,
    tables,
    rpc: { ...rpc, my_chat_contacts: [S1, S2] },
  });
  await context.route(/\/rest\/v1\/rpc\/my_chat_contacts_detailed/, (r) =>
    r.fulfill({
      status: 404,
      contentType: "application/json",
      body: '{"code":"PGRST202","message":"not found"}',
    }),
  );
  await seedSession(context, TEACHER);
  await gotoReady(page, "/chats/new");
  await expect(page.getByRole("heading", { name: "جهات الاتصال · 2" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: /بلال/ })).toBeVisible();
});

test("واجب لكل طلاب الحلقة: إسناد واحد لكل طالب ورسالة بالعدد", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, { user: TEACHER, tables, rpc });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/teacher?tab=assign");
  const selects = page.locator("select");
  await expect(selects.first()).toBeVisible({ timeout: 20_000 });
  await selects.nth(1).selectOption("h1");
  await selects.nth(0).selectOption({ label: "كل طلاب الحلقة المختارة" });
  await selects.nth(2).selectOption("الفاتحة");
  await page.getByLabel("إلى آية").fill("7");
  await page.getByRole("button", { name: /إسناد الواجب/ }).click();
  await expect(page.getByRole("status")).toContainText("أُسند الواجب إلى 2 من 2");
  const posts = calls.filter((c) => c.path === "/rest/v1/assignments" && c.method === "POST");
  expect(posts.map((c) => (c.body as { student_id: string }).student_id).sort()).toEqual(
    [S1, S2].sort(),
  );
});

test("صفحة الطالب: «واجب جديد» يفتح الإسناد مُعبَّأً باسمه", async ({ page, context }) => {
  await installFakeSupabase(context, {
    user: TEACHER,
    tables: { ...tables, quran_progress: [] },
    rpc,
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/quran/student/${S1}`);
  await page.getByRole("link", { name: "واجب جديد" }).click({ timeout: 20_000 });
  await expect(page).toHaveURL(new RegExp(`tab=assign.*student=${S1}`));
  await expect(page.locator("select").first()).toHaveValue(S1, { timeout: 20_000 });
});

test("حلقاتك اليوم: «السجل اليومي» و«رمز الحضور» على الحلقة نفسها، والإشعارات تُعدّ في الخادم", async ({
  page,
  context,
}) => {
  const today = new Date();
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: {
      ...tables,
      notifications: Array.from({ length: 12 }, (_, i) => ({
        id: `n${i}`,
        user_id: TEACHER.id,
        read: false,
        title: "إشعار",
        created_at: iso(i),
      })),
    },
    rpc: {
      ...rpc,
      my_halaqa_schedule: [
        {
          slot_id: "sl1",
          halaqa_id: "h1",
          halaqa_name: "حلقة الفجر",
          center_name: null,
          teacher_name: null,
          weekday: today.getDay(),
          start_time: "05:30:00",
          end_time: "06:30:00",
          location: null,
          online_url: null,
          as_role: "teacher",
          child_name: null,
        },
      ],
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/today");
  const reg = page.getByRole("link", { name: "السجل اليومي" });
  await expect(reg).toHaveAttribute("href", /halaqa=h1/, { timeout: 20_000 });
  await expect(page.getByRole("link", { name: "رمز الحضور" })).toHaveAttribute(
    "href",
    /attendance-code\?halaqa=h1/,
  );
  const count = calls.find((c) => c.path === "/rest/v1/notifications" && c.method === "HEAD");
  expect(count?.query ?? "").toContain("read=eq.false");
  await reg.click();
  await expect(page).toHaveURL(/\/teacher\/register\?halaqa=h1/);
});
