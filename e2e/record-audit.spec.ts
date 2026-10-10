import { expect, test } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// الإصدار 1.18.0 (المرحلة 2): تبويب «التدقيق» في السجل اليومي، وعيّنة الأسبوع للمشرف، وجودة الإدخال في لوحة المركز.

const H = "hhhh0000-0000-4000-8000-000000000018";
const R = "rrrr0000-0000-4000-8000-000000000018";
const shot = (name: string) => (process.env.SHOTS ? `${process.env.SHOTS}/${name}.png` : undefined);

const sheet = {
  halaqa: { id: H, name: "حلقة الفجر", teacher_name: "الأستاذ يحيى" },
  date: "2026-10-04",
  today: "2026-10-04",
  can_edit: true,
  can_lock: false,
  record: null,
  students: [],
};
const halaqat = [
  {
    id: H,
    center_id: "c1",
    name: "حلقة الفجر",
    teacher_id: TEACHER.id,
    schedule: null,
    created_at: "2026-01-01",
  },
];
const anomalies = {
  halaqa_id: H,
  days: 30,
  from: "2026-09-05",
  to: "2026-10-04",
  records: 20,
  items: [
    { code: "perfect_attendance", student_id: "s2", student_name: "بلال", detail: { days: 20 } },
    {
      code: "pages_spike",
      student_id: "s1",
      student_name: "أحمد",
      date: "2026-10-02",
      detail: { pages: 7 },
    },
  ],
};
const audit = [
  {
    id: 2,
    at: "2026-10-03T18:00:00Z",
    halaqa_id: H,
    record_date: "2026-10-02",
    action: "edit",
    student_id: "s1",
    student_name: "أحمد",
    actor_id: TEACHER.id,
    actor_name: "الأستاذ يحيى",
    before: { status: "present", memorize: { segments: [], score: 85 } },
    after: { status: "late", memorize: { segments: [], score: 85 } },
  },
  {
    id: 1,
    at: "2026-10-03T17:59:00Z",
    halaqa_id: H,
    record_date: "2026-10-02",
    action: "reopen",
    student_id: null,
    student_name: null,
    actor_id: TEACHER.id,
    actor_name: "الأستاذ يحيى",
    before: null,
    after: null,
  },
];

test("تبويب التدقيق: التنبيهات أولاً ثم التعديل بقبله وبعده، ولا عيّنة للمعلّم", async ({
  page,
  context,
}) => {
  await installFakeSupabase(context, {
    user: TEACHER,
    tables: { halaqat },
    rpc: {
      daily_record_sheet: () => sheet as never,
      daily_record_anomalies: anomalies as never,
      daily_record_audit_list: audit as never,
    },
    fail: { rpc: ["audit_sample"] },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/teacher/register?halaqa=${H}&view=audit`);
  const box = page.getByTestId("record-audit");
  await expect(box).toBeVisible();
  await expect(page.getByRole("tab", { name: "التدقيق" })).toHaveAttribute("aria-selected", "true");
  const rows = box.locator("[data-anomaly]");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute("data-anomaly", "pages_spike");
  await expect(rows.first()).toContainText("حفظ 7 صفحات في يوم واحد");
  const edit = box.locator('[data-audit="edit"]');
  await expect(edit).toContainText("الحضور:");
  await expect(edit).toContainText("حاضر");
  await expect(edit).toContainText("متأخر");
  await expect(edit).not.toContainText("الحفظ:");
  await expect(edit).toContainText("الأستاذ يحيى");
  await expect(box.locator('[data-audit="reopen"]')).toContainText("أُعيد فتح اليوم");
  await expect(page.getByTestId("audit-sample")).toHaveCount(0);
  if (shot("audit-tab")) await page.screenshot({ path: shot("audit-tab"), fullPage: true });
  // كل بند يفتح يومه.
  await rows.first().getByRole("button").click();
  await expect(page).toHaveURL(/date=2026-10-02/);
});

test("عيّنة الأسبوع: «يحتاج تصحيحاً» يتطلب سبباً ويُرسَل للخادم", async ({ page, context }) => {
  let reviewed: unknown = null;
  const sample = () => ({
    halaqa_id: H,
    week: "2026-09-28",
    items: [
      {
        record_id: R,
        date: "2026-10-02",
        student_id: "s1",
        student_name: "أحمد",
        entry: { status: "present" },
        review: reviewed
          ? { ok: false, note: "كان متأخراً", at: "2026-10-04T08:00:00Z", reviewer_name: "المشرف" }
          : null,
      },
    ],
  });
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: { halaqat },
    rpc: {
      daily_record_sheet: () => sheet as never,
      daily_record_anomalies: { ...anomalies, items: [] } as never,
      daily_record_audit_list: [] as never,
      audit_sample: () => sample() as never,
      review_audit_sample: (b: unknown) => {
        reviewed = b;
        return { ok: true } as never;
      },
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/teacher/register?halaqa=${H}&view=audit`);
  const box = page.getByTestId("audit-sample");
  await expect(box).toContainText("أحمد");
  await box.getByRole("button", { name: "يحتاج تصحيحاً" }).click();
  await box.getByRole("button", { name: "أرسل للمعلّم" }).click();
  await expect(page.getByText("اكتب ما يحتاج تصحيحاً.")).toBeVisible();
  expect(reviewed).toBeNull();
  await box.getByPlaceholder("ما الذي يحتاج تصحيحاً؟").fill("كان متأخراً");
  await box.getByRole("button", { name: "أرسل للمعلّم" }).click();
  await expect(box).toContainText("يحتاج تصحيحاً — المشرف: كان متأخراً");
  if (shot("audit-sample")) await page.screenshot({ path: shot("audit-sample"), fullPage: true });
  expect(calls.find((c) => c.path === "/rest/v1/rpc/review_audit_sample")?.body).toEqual({
    _record: R,
    _student: "s1",
    _ok: false,
    _note: "كان متأخراً",
  });
});

test("لوحة المركز: جودة الإدخال لكل حلقة تفتح تدقيقها", async ({ page, context }) => {
  const C = "cccc0000-0000-4000-8000-0000000000c1";
  await installFakeSupabase(context, {
    user: TEACHER,
    tables: { halaqat },
    rpc: {
      center_dashboard: {
        center: { id: C, name: "مركز النور", city: "صنعاء" },
        period_days: 30,
        since: "2026-08-30",
        can_manage: true,
        totals: {
          halaqat: 1,
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
      center_record_quality: {
        center_id: C,
        days: 30,
        halaqat: [
          {
            halaqa_id: H,
            name: "حلقة الفجر",
            teacher_name: "الأستاذ يحيى",
            records: 18,
            edits_after_close: 3,
            late_closes: 1,
            warnings: 4,
          },
        ],
      },
      daily_record_sheet: () => sheet as never,
      daily_record_anomalies: anomalies as never,
      daily_record_audit_list: audit as never,
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/center/${C}`);
  const q = page.getByTestId("record-quality");
  await expect(q).toContainText("جودة الإدخال (آخر 30 يوماً)");
  const row = q.locator(`[data-quality-halaqa="${H}"]`);
  await expect(row).toContainText("الأستاذ يحيى");
  await expect(row.locator("td").nth(2)).toHaveText("3");
  if (shot("record-quality")) await q.screenshot({ path: shot("record-quality") });
  await row.getByRole("link", { name: "حلقة الفجر" }).click();
  await expect(page).toHaveURL(/view=audit/);
  await expect(page.getByTestId("record-audit")).toBeVisible();
});
