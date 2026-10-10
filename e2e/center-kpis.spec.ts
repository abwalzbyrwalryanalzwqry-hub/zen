import { expect, test } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 10.3: مؤشرات الحلقات والاتجاه الشهري في لوحة المركز.
test("مؤشرات المركز لكل حلقة", async ({ page, context }) => {
  const C = "cccc0000-0000-4000-8000-0000000000c1";
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    rpc: {
      center_dashboard: {
        center: { id: C, name: "مركز النور", city: "صنعاء" },
        period_days: 30,
        since: "2026-08-30",
        can_manage: true,
        totals: {
          halaqat: 2,
          students: 5,
          teachers: 1,
          weekly_slots: 0,
          attendance_records: 0,
          attendance_rate: null,
          pages_memorized: 0,
          assessments: 0,
          avg_score: null,
          exams: 0,
          avg_exam: null,
          at_risk: 0,
        },
        halaqat: [],
        teachers: [],
        at_risk: [],
        weekly: [],
      },
      list_center_students: [],
      center_kpis: {
        months: 6,
        totals: { students: 5, pages_30: 14, dropouts: 2, regularity: 72 },
        halaqat: [
          {
            id: "h1",
            name: "حلقة الفجر",
            students: 3,
            pages_30: 10,
            pages_per_student: 3.3,
            regularity: 80,
            dropouts: 1,
            dropout_rate: 33,
          },
          {
            id: "h2",
            name: "حلقة العصر",
            students: 2,
            pages_30: 4,
            pages_per_student: 2,
            regularity: 60,
            dropouts: 1,
            dropout_rate: 50,
          },
        ],
        monthly: [
          { month: "2026-08", pages: 20, attendance_rate: 70, active_students: 4 },
          { month: "2026-09", pages: 14, attendance_rate: 72, active_students: 3 },
        ],
      },
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/center/${C}`);
  const box = page.getByRole("region", { name: "مؤشرات الحلقات" });
  await expect(box).toContainText("مؤشرات الحلقات (آخر 30 يوماً)", { timeout: 20_000 });
  await expect(box.locator('[data-kpi-halaqa="h1"]')).toContainText("3.3");
  await expect(box.locator('[data-kpi-halaqa="h2"]')).toContainText("1 (50%)");
  await expect(box.locator(".recharts-surface").first()).toBeVisible();
  expect(calls.find((c) => c.path === "/rest/v1/rpc/center_kpis")?.body).toEqual({
    _center: C,
    _months: 6,
  });
  await expect(page.getByText("قراءة فقط")).toHaveCount(0);
});

// المرحلة 10.4: المشرف التعليمي يرى اللوحة بشارة «قراءة فقط».
test("المشرف التعليمي: لوحة المركز للقراءة فقط", async ({ page, context }) => {
  await installFakeSupabase(context, {
    user: TEACHER,
    rpc: {
      center_dashboard: {
        center: { id: "c2", name: "مركز النور", city: null },
        period_days: 30,
        since: "2026-08-30",
        can_manage: false,
        totals: {
          halaqat: 0,
          students: 0,
          teachers: 0,
          weekly_slots: 0,
          attendance_records: 0,
          attendance_rate: null,
          pages_memorized: 0,
          assessments: 0,
          avg_score: null,
          exams: 0,
          avg_exam: null,
          at_risk: 0,
        },
        halaqat: [],
        teachers: [],
        at_risk: [],
        weekly: [],
      },
      list_center_students: [],
      center_kpis: {
        months: 6,
        totals: { students: 0, pages_30: 0, dropouts: 0, regularity: null },
        halaqat: [],
        monthly: [],
      },
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/center/c2");
  await expect(page.getByText("قراءة فقط")).toBeVisible({ timeout: 20_000 });
});
