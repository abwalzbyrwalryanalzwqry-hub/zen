import { expect, test } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase } from "./fake-supabase";
import { expireStoredToken, installOfflineSwitch, seedSessionOnce } from "./offline-net";

// الحساب دون اتصال (1.16.0): الإنترنت للدخول أول مرة فقط. بعدها يفتح التطبيق دون شبكة حتى بعد انتهاء
// رمز الدخول، فيرى المعلّم حلقته وطلابه ويسجّل الحضور على الجهاز، ثم يُرسل كل شيء عند عودة الاتصال.

const H = "hhhh0000-0000-4000-8000-000000000001";
const R = "rrrr0000-0000-4000-8000-000000000001";
const student = (status: string | null = null, version = 0) => ({
  student_id: "s1",
  name: "أحمد",
  avatar: null,
  status,
  reason: null,
  version,
  note: null,
  evaluation: null,
  memorize: null,
  review: null,
  last_memorize: null,
  last_review: null,
  absences_30d: 0,
});
const sheet = {
  halaqa: { id: H, name: "حلقة الفجر", teacher_name: "الأستاذ يحيى" },
  date: "2026-10-04",
  today: "2026-10-04",
  can_edit: true,
  can_lock: false,
  record: {
    id: R,
    status: "open",
    version: 3,
    notes: null,
    completed_at: null,
    locked_at: null,
    completed_by_name: null,
  },
  students: [student()],
};

test("بعد انتهاء رمز الدخول دون اتصال: الحساب مفتوح، والسجل من الجهاز، والحضور يُرسل عند العودة", async ({
  page,
  context,
}) => {
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: {
      halaqat: [{ id: H, center_id: "c1", name: "حلقة الفجر", teacher_id: TEACHER.id }],
    },
    rpc: { daily_record_sheet: sheet, set_daily_attendance: student("late", 1) },
  });
  await seedSessionOnce(context, TEACHER);
  const net = await installOfflineSwitch(context);

  // مع الاتصال: فتح السجل مرة يحفظ نسخته على الجهاز.
  await gotoReady(page, `/teacher/register?halaqa=${H}`);
  const group = page.getByRole("radiogroup", { name: "حضور أحمد" });
  await expect(group).toBeVisible({ timeout: 20_000 });

  // انقطع الاتصال ومضت ساعة: الرمز منتهٍ ولا تجديد ممكن، ثم أُعيد فتح التطبيق.
  await net.set(page, true);
  await expireStoredToken(page);
  await page.reload();
  await expect(group).toBeVisible({ timeout: 20_000 });
  expect(new URL(page.url()).pathname).toBe("/teacher/register");
  await expect(page.getByText("الدخول كضيف")).toHaveCount(0);

  const before = calls.length;
  await group.getByRole("radio", { name: "متأخر" }).click();
  await expect(page.getByText("1 تعديل بانتظار الإرسال")).toBeVisible();
  await expect(group.getByRole("radio", { name: "متأخر" })).toHaveAttribute("aria-checked", "true");
  // لا شيء خرج إلى الخادم برمز منتهٍ أو بمفتاح التطبيق العام.
  expect(calls.length).toBe(before);

  // عاد الاتصال: يتجدّد الرمز ويُرسل المحفوظ.
  await net.set(page, false);
  await expect(page.getByText("أُرسل 1 تعديل محفوظ على الجهاز.")).toBeVisible({ timeout: 15_000 });
  expect(calls.some((c) => c.path === "/auth/v1/token")).toBe(true);
  const sent = calls.filter((c) => c.path === "/rest/v1/rpc/set_daily_attendance");
  expect(sent.at(-1)?.body).toMatchObject({ _student: "s1", _status: "late" });
});

test("يوم جديد دون اتصال: الورقة من أحدث نسخة، والحضور الفردي والجماعي يُحفظ، ثم يُفتح السجل ويُرسل", async ({
  page,
  context,
}) => {
  const two = [student(), { ...student(), student_id: "s2", name: "بلال" }];
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: {
      halaqat: [{ id: H, center_id: "c1", name: "حلقة الفجر", teacher_id: TEACHER.id }],
    },
    rpc: {
      daily_record_sheet: (b: unknown) => ({
        ...sheet,
        date: (b as { _date: string })._date,
        today: "2026-10-04",
        students: two,
      }),
      daily_record_week: [],
      open_daily_record: { id: R, status: "open", version: 1 },
      set_daily_attendance: (b: unknown) => ({
        ...student((b as { _status: string })._status, 1),
        student_id: (b as { _student: string })._student,
      }),
    },
  });
  await seedSessionOnce(context, TEACHER);
  const net = await installOfflineSwitch(context);

  await gotoReady(page, `/teacher/register?halaqa=${H}&date=2026-10-03`);
  await expect(page.getByRole("radiogroup", { name: "حضور أحمد" })).toBeVisible({
    timeout: 20_000,
  });

  await net.set(page, true);
  await expireStoredToken(page);
  await page.goto(`/teacher/register?halaqa=${H}&date=2026-10-04`);
  await expect(page.getByText("لا اتصال: يوم جديد على الجهاز", { exact: false })).toBeVisible({
    timeout: 20_000,
  });
  const ahmad = page.getByRole("radiogroup", { name: "حضور أحمد" });
  await ahmad.getByRole("radio", { name: "غائب" }).click();
  await page.getByRole("button", { name: /الجميع حاضر/ }).click();
  await expect(page.getByText("2 تعديل بانتظار الإرسال")).toBeVisible();
  await expect(
    page.getByRole("radiogroup", { name: "حضور بلال" }).getByRole("radio", { name: "حاضر" }),
  ).toHaveAttribute("aria-checked", "true");

  // إعادة الفتح دون اتصال: ما أُدخل باقٍ على الورقة.
  await page.reload();
  await expect(ahmad.getByRole("radio", { name: "غائب" })).toHaveAttribute("aria-checked", "true", {
    timeout: 20_000,
  });

  await net.set(page, false);
  await expect(page.getByText("أُرسل 2 تعديل محفوظ على الجهاز.")).toBeVisible({ timeout: 15_000 });
  const opened = calls.filter((c) => c.path === "/rest/v1/rpc/open_daily_record");
  expect(opened).toHaveLength(1);
  expect(opened[0].body).toMatchObject({ _halaqa: H, _date: "2026-10-04" });
  const sent = calls.filter((c) => c.path === "/rest/v1/rpc/set_daily_attendance");
  expect(sent.map((c) => (c.body as { _record: string })._record)).toEqual([R, R]);
  expect(sent.map((c) => (c.body as { _status: string })._status).sort()).toEqual([
    "absent",
    "present",
  ]);
});
