import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 11.2: رابط إشعار التقرير الشهري يفتح الابن مع فترة الشهر جاهزة للتصدير.
test("التقرير الشهري من رابط الإشعار", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      my_guardian_children: [
        { student_id: "kid1", name: "عمر", relation: "father" },
        { student_id: "kid2", name: "مريم", relation: "father" },
      ],
      guardian_room_consents: [],
      guardian_pending_invites: [],
      guardian_child_overview: (b: unknown) => ({
        student: { id: (b as { _student: string })._student, name: "مريم" },
        halaqat: [],
        attendance_30d: { present: 0, late: 0, absent: 0, excused: 0 },
        attendance: [],
        assignments: [],
        assessments: [],
        exams: [],
        mushaf: { memorized_pages: 0, last_session: null },
      }),
      student_report: null,
      student_achievements: null,
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/family?child=kid2&month=2026-08");
  await expect(page.getByText("التقرير الشهري (2026-08)")).toBeVisible({ timeout: 20_000 });
  const dates = page.locator('input[type="date"]');
  await expect(dates.nth(0)).toHaveValue("2026-08-01");
  await expect(dates.nth(1)).toHaveValue("2026-08-31");
  // الابن المقصود في الرابط لا الأول في القائمة.
  expect(
    calls.some(
      (c) =>
        c.path === "/rest/v1/rpc/guardian_child_overview" &&
        (c.body as { _student: string })._student === "kid2",
    ),
  ).toBe(true);
});
