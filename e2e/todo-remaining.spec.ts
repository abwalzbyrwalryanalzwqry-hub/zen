import { expect, test } from "@playwright/test";
import { STUDENT, TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

/**
 * بقايا docs/TODO.md: محرّك التلاوة كسول (M1)، وصندوق التنبيهات على دفعات ويفتح رابط التنبيه،
 * ورسالة المتعثّر تُرسَل في محادثة وليّ الأمر.
 */
const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();

test("محرّك التلاوة لا يُحمَّل في الرئيسية، ويُحمَّل مع شاشة القارئ", async ({ page, context }) => {
  await installFakeSupabase(context, { user: STUDENT });
  await seedSession(context, STUDENT);
  const engine: string[] = [];
  page.on("request", (r) => {
    if (/use-recitation-player-/.test(r.url())) engine.push(r.url());
  });
  await gotoReady(page, "/today");
  await expect(page.getByRole("heading", { name: "واجب اليوم" })).toBeVisible({ timeout: 20_000 });
  expect(engine).toHaveLength(0);
  await gotoReady(page, "/mushaf/read?surah=112&ayah=1");
  await expect(page.getByLabel("منطقة قراءة الآيات")).toContainText("سورةالإخلاص", {
    timeout: 20_000,
  });
  expect(engine.length).toBeGreaterThan(0);
});

test("التنبيهات: «عرض تنبيهات أقدم» يجلب ما قبل آخر تنبيه، والنقر يفتح رابطه", async ({
  page,
  context,
}) => {
  const rows = Array.from({ length: 31 }, (_, i) => ({
    id: `n${i}`,
    user_id: STUDENT.id,
    kind: "assignment",
    title: `تنبيه ${i}`,
    body: null,
    link: "/exams",
    read: true,
    created_at: iso(i),
  }));
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    tables: { notifications: rows },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/notifications");
  const more = page.getByRole("button", { name: "عرض تنبيهات أقدم" });
  await expect(more).toBeVisible({ timeout: 20_000 });
  await more.click();
  await expect
    .poll(() =>
      calls.some((c) => c.path === "/rest/v1/notifications" && /created_at=lt\./.test(c.query)),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: /تنبيه 0/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/exams/);
});

test("المتعثّر: الرسالة تُرسَل في محادثة وليّ الأمر بعد نقرة صريحة", async ({ page, context }) => {
  const S = "dddddddd-0000-4000-8000-0000000000a1";
  const G = "dddddddd-0000-4000-8000-0000000000b1";
  const { calls } = await installFakeSupabase(context, {
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
          student_id: S,
          name: "عمر",
          halaqa_id: "h1",
          halaqa_name: "حلقة الفجر",
          reasons: ["absences"],
          absences: 3,
          avg_score: 80,
          overdue: 0,
          inactive_days: 0,
          has_guardian: true,
        },
      ],
      student_guardians: [
        { guardian_id: G, name: "أبو عمر", relation: "father", linked_at: iso(9) },
      ],
      get_or_create_direct_chat: "chat-g1",
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/teacher/at-risk");
  await page.getByRole("button", { name: /رسالة لوليّ الأمر/ }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "إرسالها في محادثة وليّ الأمر" }).click();
  await page.getByRole("button", { name: "إرسال إلى أبو عمر" }).click();
  await expect(page.getByRole("status").filter({ hasText: "أُرسلت إلى أبو عمر" })).toBeVisible();
  const sent = calls.find((c) => c.path === "/rest/v1/messages" && c.method === "POST");
  expect((sent?.body as { chat_id: string }).chat_id).toBe("chat-g1");
});
