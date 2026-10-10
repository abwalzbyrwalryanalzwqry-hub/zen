import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 11.3: وليّ الأمر يضع هدفاً لابنه بمكافأة رمزية ويرى تقدّمه.
test("هدف عائلي من وليّ الأمر", async ({ page, context }) => {
  const goals: Array<Record<string, unknown>> = [];
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      my_guardian_children: [{ student_id: "kid1", name: "عمر", relation: "father" }],
      guardian_room_consents: [],
      guardian_pending_invites: [],
      guardian_child_overview: {
        student: { id: "kid1", name: "عمر" },
        halaqat: [],
        attendance_30d: { present: 0, late: 0, absent: 0, excused: 0 },
        attendance: [],
        assignments: [],
        assessments: [],
        exams: [],
        mushaf: { memorized_pages: 0, last_session: null },
      },
      student_report: null,
      student_achievements: null,
      family_goals_for: () => goals,
      set_family_goal: (b: unknown) => {
        const x = b as { _kind: string; _target: number; _title?: string; _reward?: string };
        goals.push({
          id: "g1",
          kind: x._kind,
          target: x._target,
          progress: 4,
          title: x._title ?? null,
          reward: x._reward ?? null,
          starts_on: "2026-09-29",
          ends_on: null,
          status: "active",
          achieved_at: null,
          expired: false,
          mine: true,
        });
        return "g1";
      },
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/family");
  const box = page.getByRole("region", { name: "الأهداف العائلية" });
  await expect(box).toContainText("ضع لابنك هدفاً صغيراً", { timeout: 20_000 });
  await box.getByRole("button", { name: "هدف جديد" }).click();
  const form = box.getByRole("form", { name: "هدف جديد" });
  await form.getByLabel("العدد (صفحة)").fill("10");
  await form.getByLabel("المكافأة الرمزية (اختياري)").fill("نزهة الجمعة");
  await form.getByRole("button", { name: "حفظ الهدف" }).click();
  await expect(box.locator('[data-goal="g1"]')).toContainText("حفظ صفحات: 10 صفحة");
  await expect(box.locator('[data-goal="g1"]')).toContainText("نزهة الجمعة");
  await expect(box.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4");
  expect(calls.find((c) => c.path === "/rest/v1/rpc/set_family_goal")?.body).toMatchObject({
    _student: "kid1",
    _kind: "pages",
    _target: 10,
    _reward: "نزهة الجمعة",
  });
});
