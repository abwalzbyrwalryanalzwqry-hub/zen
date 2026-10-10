import { expect, test } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

/**
 * المرحلة P1 من فحص الأقسام (docs/SECTIONS_AUDIT.md): «طلابي» بتبويبات في الرابط وتبويب طلاب،
 * ومؤشرات رئيسية المعلّم، و«المزيد» بأدوات المعلّم وتسجيل الخروج، ومرشّحات المحادثات.
 */
const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
const today = new Date().toISOString().slice(0, 10);
const S1 = "bbbbbbbb-0000-4000-8000-0000000000b1";
const S2 = "bbbbbbbb-0000-4000-8000-0000000000b2";
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
  recitation_sessions: [
    {
      id: "rs1",
      student_id: S1,
      halaqa_id: "h1",
      assignment_id: null,
      surah_name: "الملك",
      from_ayah: 1,
      to_ayah: 5,
      kind: "memorize",
      status: "awaiting_teacher",
      audio_path: null,
      duration_seconds: 0,
      session_date: today,
      created_at: iso(30),
      ai_score: null,
      ai_analysis: null,
      transcript: null,
    },
  ],
};
const rpc = {
  my_home_context: homeCtx,
  my_halaqa_student_ids: [S1, S2],
  at_risk_students: [
    {
      student_id: S2,
      name: "بلال",
      halaqa_id: "h1",
      halaqa_name: "حلقة الفجر",
      reasons: ["absences"],
      absences: 3,
      avg_score: null,
      overdue: 0,
      inactive_days: null,
      has_guardian: false,
    },
  ],
  teacher_home_kpis: {
    students: 2,
    pending_recitations: 12,
    attendance_marked: 2,
    attendance_present: 1,
    due_assignments: 3,
    at_risk: 1,
  },
};

test("طلابي: التبويب الافتراضي التسميعات بشارة، والتبويب في الرابط، وتبويب الطلاب يبحث ويعلّم", async ({
  page,
  context,
}) => {
  await installFakeSupabase(context, { user: TEACHER, tables, rpc });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/teacher");
  const review = page.getByRole("tab", { name: /^التسميعات/ });
  await expect(review).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
  await expect(review).toContainText("1");
  // لا زر رجوع في صفحة جذرية من الشريط، و«السجل اليومي» في الرأس بدل تبويب حضور ثانٍ.
  await expect(page.locator("header").getByRole("button", { name: "رجوع" })).toHaveCount(0);
  await expect(page.locator("header").getByRole("link", { name: "السجل اليومي" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "الحضور" })).toHaveCount(0);

  await page.getByRole("tab", { name: "الطلاب" }).click();
  await expect(page).toHaveURL(/tab=students/);
  await expect(page.getByText("1 ينتظر التقييم")).toBeVisible();
  await expect(page.getByText("يحتاج متابعة")).toBeVisible();
  await page.getByLabel("ابحث باسم الطالب").fill("احمد");
  await expect(page.getByRole("link", { name: /أحمد/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /بلال/ })).toHaveCount(0);

  // إعادة التحميل تبقي التبويب.
  await page.reload();
  await expect(page.getByRole("tab", { name: "الطلاب" })).toHaveAttribute("aria-selected", "true", {
    timeout: 20_000,
  });
});

test("المسار القديم /quran/students يحوّل إلى تبويب الطلاب", async ({ page, context }) => {
  await installFakeSupabase(context, { user: TEACHER, tables, rpc });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/quran/students");
  await expect(page).toHaveURL(/\/teacher\?tab=students/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "طلابي" })).toBeVisible();
});

test("رئيسية المعلّم: مؤشرات من الخادم تقود إلى مكان العمل", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, { user: TEACHER, tables, rpc });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/today");
  const kpis = page.getByRole("region", { name: "مؤشرات اليوم" });
  await expect(kpis).toContainText("9+", { timeout: 20_000 });
  await expect(kpis).toContainText("1/2");
  await expect(kpis).toContainText("تسميع ينتظر تقييمك");
  expect(calls.some((c) => c.path === "/rest/v1/rpc/teacher_home_kpis")).toBe(true);
  // لا روابط مكرّرة للشريط («طلابي والتقييم» و«حفظ الطلاب»).
  await expect(page.getByText("حفظ الطلاب")).toHaveCount(0);
  await kpis.getByRole("link", { name: /تسميع ينتظر تقييمك/ }).click();
  await expect(page).toHaveURL(/\/teacher\?tab=review/);
});

test("المزيد: بطاقة الحساب وأدوات المعلّم وتسجيل الخروج بتأكيد", async ({ page, context }) => {
  await installFakeSupabase(context, { user: TEACHER, tables, rpc });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/more");
  await expect(page.getByRole("heading", { name: "أدوات المعلّم" })).toBeVisible({
    timeout: 20_000,
  });
  for (const label of ["السجل اليومي", "رمز الحضور", "طلاب يحتاجون متابعة", "إضافة طلاب"]) {
    await expect(page.getByRole("link", { name: new RegExp(label) })).toBeVisible();
  }
  await expect(page.getByText("حفظ الطلاب")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /معلّم · الحساب/ })).toBeVisible();
  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await expect(page.getByText("تسجيل الخروج من هذا الجهاز؟")).toBeVisible();
  await page.getByRole("button", { name: "إلغاء" }).click();
  await expect(page.getByText("تسجيل الخروج من هذا الجهاز؟")).toHaveCount(0);
  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "تسجيل الخروج" }).click();
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 20_000 });
});

test("المحادثات: مرشّحات الكل وغير المقروءة والحلقات والمباشرة", async ({ page, context }) => {
  const chat = (id: string, name: string, unread: number) => ({
    id,
    is_group: false,
    title: null,
    last_message: `مرحباً من ${name}`,
    updated_at: iso(5),
    created_at: iso(500),
    peer: { id: `p-${id}`, name, avatar: null, role: "student" },
    unread,
    muted: false,
  });
  await installFakeSupabase(context, {
    user: TEACHER,
    tables,
    rpc: {
      ...rpc,
      my_inbox: [chat("c1", "أحمد", 2), chat("c2", "بلال", 0)],
      my_rooms: [
        {
          room_id: "r1",
          halaqa_id: "h1",
          halaqa_name: "حلقة الفجر",
          kind: "discussion",
          enabled: true,
          role: "teacher",
          can_post: true,
          last_message: null,
          last_at: null,
          unread: 0,
        },
      ],
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/chats");
  await expect(page.getByText("نقاش حلقة الفجر")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("مرحباً من بلال")).toBeVisible();

  await page.getByRole("button", { name: "غير مقروءة" }).click();
  await expect(page.getByText("مرحباً من أحمد")).toBeVisible();
  await expect(page.getByText("مرحباً من بلال")).toHaveCount(0);
  await expect(page.getByText("نقاش حلقة الفجر")).toHaveCount(0);

  await page.getByRole("button", { name: "الحلقات" }).click();
  await expect(page.getByText("نقاش حلقة الفجر")).toBeVisible();
  await expect(page.getByText("مرحباً من أحمد")).toHaveCount(0);

  await page.getByRole("button", { name: "المباشرة" }).click();
  await expect(page.getByText("نقاش حلقة الفجر")).toHaveCount(0);
  await expect(page.getByText("مرحباً من بلال")).toBeVisible();
});
