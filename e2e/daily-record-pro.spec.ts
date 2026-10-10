import { expect, test } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// الإصدار 1.10.0: شبكة الآيات وحد السورة، وقائمة سور المصحف، والمصحف على آخر آية، والتقييم المطويّ،
// وقائمة السجلات السابقة بالتعديل والحذف.

const H = "hhhh0000-0000-4000-8000-000000000001";
const R = "rrrr0000-0000-4000-8000-000000000001";
const shot = (name: string) => (process.env.SHOTS ? `${process.env.SHOTS}/${name}.png` : undefined);

const student = {
  student_id: "s1",
  name: "أحمد",
  avatar: null,
  status: null,
  reason: null,
  version: 0,
  note: null,
  evaluation: null,
  memorize: null,
  review: null,
  last_memorize: { surah_name: "الملك", from_ayah: 1, to_ayah: 10, session_date: "2026-10-03" },
  last_review: null,
  absences_30d: 0,
};

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
  students: [student],
};

const day = (id: string, date: string, status: string) => ({
  id,
  date,
  status,
  version: 2,
  notes: null,
  completed_at: null,
  updated_at: `${date}T10:00:00Z`,
  present: 8,
  late: 1,
  absent: 2,
  excused: 0,
  memorized: 6,
  reviewed: 4,
  editable: true,
});

test("السجل اليومي الاحترافي: شبكة الآيات وحدّ السورة والمصحف والتقييم المطويّ", async ({
  page,
  context,
}) => {
  await installFakeSupabase(context, {
    user: TEACHER,
    tables: {
      halaqat: [
        {
          id: H,
          center_id: "c1",
          name: "حلقة الفجر",
          teacher_id: TEACHER.id,
          schedule: null,
          created_at: "2026-01-01",
        },
      ],
    },
    rpc: { daily_record_sheet: () => sheet as never },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/teacher/register?halaqa=${H}`);
  await page.getByRole("button", { name: "تفاصيل أحمد" }).click();
  const dialog = page.getByRole("dialog", { name: "أحمد" });

  // التقييم مطويّ تحت عنوانه.
  const evalToggle = dialog.getByRole("button", { name: /التقييم/ });
  await expect(evalToggle).toHaveAttribute("aria-expanded", "false");

  await dialog.getByRole("button", { name: "إضافة حفظ" }).click();
  const memo = dialog.getByRole("region", { name: "الحفظ" });
  await expect(memo.getByLabel("من آية")).toHaveValue("11");

  // شبكة آيات الملك (30 آية) عند التركيز على «إلى آية».
  await memo.getByLabel("إلى آية").focus();
  const grid = memo.getByRole("group", { name: /اختر آية النهاية من سورة الملك/ });
  await expect(grid).toBeVisible();
  await expect(grid.getByRole("button", { name: "30", exact: true })).toBeVisible();
  await expect(grid.getByRole("button", { name: "31", exact: true })).toHaveCount(0);
  await expect(grid.getByRole("button", { name: "10", exact: true })).toBeDisabled();
  if (shot("grid")) await page.screenshot({ path: shot("grid")! });
  await grid.getByRole("button", { name: "20", exact: true }).click();
  await expect(memo.getByLabel("إلى آية")).toHaveValue("20");

  // لا يتجاوز آيات السورة.
  await memo.getByLabel("إلى آية").fill("45");
  await expect(memo.getByLabel("إلى آية")).toHaveValue("30");
  await expect(memo).toContainText("30");

  await evalToggle.click();
  await expect(evalToggle).toHaveAttribute("aria-expanded", "true");
  if (shot("dialog")) await page.screenshot({ path: shot("dialog")!, fullPage: true });

  // المصحف يفتح على آخر آية مسجّلة.
  await memo.getByRole("button", { name: "اختيار من المصحف" }).click();
  const picker = page.getByRole("dialog", { name: "اختيار من المصحف" });
  await expect(picker).toContainText("آخر ما سُجّل");
  if (shot("mushaf")) await page.screenshot({ path: shot("mushaf")! });
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();

  // 1.14.0: قسم بلا مستوى أداء لا يُحفظ تلقائياً، والإغلاق يسأل عن تجاهله.
  await expect(dialog.getByText("أكمل المدى ومستوى الأداء", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "تم" }).click();
  const discard = page.getByRole("dialog", { name: "تجاهل التعديلات؟" });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "تجاهل" }).click();
  await expect(dialog).toBeHidden();
});

test("قائمة السجلات السابقة: عنوان لكل يوم والأحدث أولاً، مع الحذف بتأكيد", async ({
  page,
  context,
}) => {
  let days = [day("d2", "2026-10-04", "completed"), day("d1", "2026-10-03", "open")];
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: {
      halaqat: [
        {
          id: H,
          center_id: "c1",
          name: "حلقة الفجر",
          teacher_id: TEACHER.id,
          schedule: null,
          created_at: "2026-01-01",
        },
      ],
    },
    rpc: {
      daily_record_sheet: () => sheet as never,
      daily_record_history: () => days as never,
      delete_daily_record: (b: unknown) => {
        days = days.filter((d) => d.id !== (b as { _record: string })._record);
        return null as never;
      },
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/teacher/register?halaqa=${H}&view=history`);
  const items = page.getByRole("region", { name: "سجلات الأيام" }).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.first().getByRole("heading")).toContainText("4 أكتوبر 2026");
  await expect(items.nth(1).getByRole("heading")).toContainText("3 أكتوبر 2026");
  if (shot("history")) await page.screenshot({ path: shot("history")!, fullPage: true });
  // 1.14.0: لمس عنوان اليوم يعاينه في نصف شاشة دون مغادرة القائمة.
  await items
    .nth(1)
    .getByRole("button", { name: /^معاينة .*3 أكتوبر 2026/ })
    .click();
  const preview = page.getByRole("dialog", { name: /3 أكتوبر 2026/ });
  await expect(preview).toContainText("أحمد");
  await expect(preview).toContainText("بلا حضور");
  await expect(preview.getByRole("button", { name: "تعديل" })).toBeVisible();
  await preview.getByRole("button", { name: "إغلاق", exact: true }).click();
  await expect(preview).toBeHidden();
  await items.nth(1).getByRole("button", { name: "حذف", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "احذف السجل" }).click();
  await expect(items).toHaveCount(1);
  expect(calls.find((c) => c.path === "/rest/v1/rpc/delete_daily_record")?.body).toMatchObject({
    _record: "d1",
    _version: 2,
  });
});
