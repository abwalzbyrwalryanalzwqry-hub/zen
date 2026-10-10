import { expect, test } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";
import { audit } from "./a11y-audit";

// السجل اليومي — المرحلة 3 من خطة التطوير: فحص الوصول الآلي للشاشة وللوحة الطالب، ولوحة المفاتيح في
// مجموعات الاختيار (الأسهم باتجاه اللغة وHome/End)، والإعلان الحي لتغيير الحضور.

const H = "hhhh0000-0000-4000-8000-0000000000a1";
const R = "rrrr0000-0000-4000-8000-0000000000a1";
const student = (
  id: string,
  name: string,
  p: Record<string, unknown> = {},
): Record<string, unknown> => ({
  student_id: id,
  name,
  avatar: null,
  status: null,
  reason: null,
  version: 0,
  note: null,
  evaluation: null,
  memorize: null,
  review: null,
  last_memorize: null,
  last_review: null,
  absences_30d: 0,
  ...p,
});

test("السجل اليومي: وصول الشاشة ولوحة الطالب، والأسهم في مجموعات الاختيار", async ({
  page,
  context,
}) => {
  let students = [student("s1", "أحمد"), student("s2", "بلال", { status: "present", version: 1 })];
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
      daily_record_sheet: () => ({
        halaqa: { id: H, name: "حلقة الفجر", teacher_name: "الأستاذ يحيى" },
        date: "2026-10-04",
        today: "2026-10-04",
        can_edit: true,
        can_lock: false,
        record: {
          id: R,
          status: "open",
          version: 1,
          notes: null,
          completed_at: null,
          locked_at: null,
          completed_by_name: null,
        },
        students,
      }),
      daily_record_week: [],
      set_daily_attendance: (b: unknown) => {
        const body = b as { _student: string; _status: string; _version: number };
        students = students.map((s) =>
          s.student_id === body._student
            ? { ...s, status: body._status, version: body._version + 1 }
            : s,
        );
        return students.find((s) => s.student_id === body._student) as never;
      },
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/teacher/register?halaqa=${H}`);
  const ahmad = page.getByRole("radiogroup", { name: "حضور أحمد" });
  await expect(ahmad).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  expect(await audit(page)).toEqual([]);

  // البطاقة تُقرأ بحالتها.
  await expect(page.getByRole("button", { name: "تفاصيل بلال" })).toHaveAttribute(
    "aria-label",
    /حاضر/,
  );

  // Tab يدخل المجموعة مرة واحدة؛ في RTL السهم الأيسر «التالي»، وEnd الأخير.
  const radios = ahmad.getByRole("radio");
  await expect(radios.nth(0)).toHaveAttribute("tabindex", "0");
  await expect(radios.nth(1)).toHaveAttribute("tabindex", "-1");
  await radios.nth(0).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(ahmad.getByRole("radio", { name: "متأخر" })).toBeFocused();
  await expect(ahmad.getByRole("radio", { name: "متأخر" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("End");
  await expect(ahmad.getByRole("radio", { name: "مستأذن" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect
    .poll(() =>
      calls
        .filter((c) => c.path === "/rest/v1/rpc/set_daily_attendance")
        .map((c) => (c.body as { _status: string })._status),
    )
    .toEqual(["late", "excused"]);
  await expect(page.getByRole("status").filter({ hasText: "أحمد: مستأذن" })).toBeAttached();

  // لوحة الطالب: الفحص نفسه داخل النافذة.
  await page.getByRole("button", { name: "تفاصيل بلال" }).click();
  const dialog = page.getByRole("dialog", { name: "بلال" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "إضافة حفظ" }).click();
  expect((await audit(page)).filter((x) => !x.startsWith("عدد h1"))).toEqual([]);
});
