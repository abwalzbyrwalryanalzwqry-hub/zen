import { expect, test, type Page } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// السجل اليومي 1.14.0 — المرحلة 5: السحب على الصف (غائب/مستأذن مع «تراجع» والسبب)، والتحديد المتعدد،
// والترتيب المحفوظ لكل حلقة.

const H = "hhhh0000-0000-4000-8000-0000000000b1";
const R = "rrrr0000-0000-4000-8000-0000000000b1";
const student = (id: string, name: string, p: Record<string, unknown> = {}) => ({
  student_id: id,
  name,
  avatar: null,
  status: null as string | null,
  reason: null as string | null,
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
const shot = (n: string) => (process.env.SHOTS ? `${process.env.SHOTS}/${n}.png` : null);

async function swipe(page: Page, name: string, dx: number) {
  const row = page
    .locator("li[data-student]")
    .filter({ has: page.getByRole("button", { name: `تفاصيل ${name}` }) });
  const box = (await row.getByRole("button", { name: `تفاصيل ${name}` }).boundingBox())!;
  const y = box.y + box.height / 2;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y);
  await page.mouse.up();
}

test("السجل اليومي: السحب والتحديد المتعدد والترتيب المحفوظ", async ({ page, context }) => {
  let students = [
    student("s1", "يوسف", { absences_30d: 1 }),
    student("s2", "أحمد", { absences_30d: 5 }),
    student("s3", "بلال"),
  ];
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: {
      halaqat: [
        {
          id: H,
          center_id: "c1",
          name: "حلقة العصر",
          teacher_id: TEACHER.id,
          schedule: null,
          created_at: "2026-01-01",
        },
      ],
    },
    rpc: {
      daily_record_sheet: () => ({
        halaqa: { id: H, name: "حلقة العصر", teacher_name: "الأستاذ يحيى" },
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
        const body = b as {
          _student: string;
          _status: string;
          _reason: string | null;
          _version: number;
        };
        students = students.map((s) =>
          s.student_id === body._student
            ? {
                ...s,
                status: body._status,
                reason: body._reason ?? s.reason,
                version: body._version + 1,
              }
            : s,
        );
        return students.find((s) => s.student_id === body._student) as never;
      },
      clear_daily_attendance: (b: unknown) => {
        const body = b as { _student: string; _version: number };
        students = students.map((s) =>
          s.student_id === body._student
            ? { ...s, status: null, reason: null, version: body._version + 1 }
            : s,
        );
        return students.find((s) => s.student_id === body._student) as never;
      },
      set_daily_attendance_bulk: (b: unknown) => {
        const rows = (
          b as { _rows: Array<{ student: string; status: string | null; version: number }> }
        )._rows;
        students = students.map((s) => {
          const r = rows.find((x) => x.student === s.student_id);
          return r ? { ...s, status: r.status, version: r.version + 1 } : s;
        });
        return {
          students: students.filter((s) => rows.some((r) => r.student === s.student_id)),
          skipped: [],
        } as never;
      },
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/teacher/register?halaqa=${H}`);
  await expect(page.getByRole("radiogroup", { name: "حضور أحمد" })).toBeVisible({
    timeout: 20_000,
  });
  const names = () => page.locator("li[data-student] p.font-bold").allTextContents();

  // الترتيب: «الأكثر غياباً» ثم يبقى بعد إعادة التحميل (محفوظ لهذه الحلقة).
  expect(await names()).toEqual(["يوسف", "أحمد", "بلال"]);
  await page.getByRole("button", { name: /^الترتيب:/ }).click();
  await page
    .getByRole("dialog", { name: "ترتيب الطلاب" })
    .getByRole("button", { name: "الأكثر غياباً" })
    .click();
  await expect.poll(names).toEqual(["أحمد", "يوسف", "بلال"]);
  await page.reload();
  await expect(page.getByRole("button", { name: "الترتيب: الأكثر غياباً" })).toBeVisible({
    timeout: 20_000,
  });
  await expect.poll(names).toEqual(["أحمد", "يوسف", "بلال"]);

  // السحب نحو نهاية السطر (يسار في RTL): غائب، و«تراجع» يعيده بلا حالة.
  await swipe(page, "يوسف", -140);
  const yusuf = page.getByRole("radiogroup", { name: "حضور يوسف" });
  await expect(yusuf.getByRole("radio", { name: "غائب" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "تراجع" }).first().click();
  await expect
    .poll(() => calls.filter((c) => c.path === "/rest/v1/rpc/clear_daily_attendance").length)
    .toBe(1);
  await expect(yusuf.getByRole("radio", { name: "غائب" })).toHaveAttribute("aria-checked", "false");

  // السحب نحو بدايته: مستأذن، ونصف شاشة السبب.
  await swipe(page, "بلال", 140);
  const reason = page.getByRole("dialog", { name: "سبب استئذان بلال" });
  await expect(reason).toBeVisible();
  if (shot("reason-sheet")) await page.screenshot({ path: shot("reason-sheet")! });
  await reason.getByRole("button", { name: "سفر" }).click();
  await expect(reason).toBeHidden();
  await expect
    .poll(() =>
      calls
        .filter((c) => c.path === "/rest/v1/rpc/set_daily_attendance")
        .map((c) => c.body as { _status: string; _reason: string | null })
        .map((b) => `${b._status}:${b._reason ?? ""}`),
    )
    .toEqual(["absent:", "excused:", "excused:سفر"]);

  // التحديد المتعدد: «تحديد» ثم لمس طالبين ثم «حاضر» مع «تراجع».
  await page.getByRole("button", { name: "تحديد", exact: true }).click();
  await page.getByRole("button", { name: /^تفاصيل أحمد/ }).click();
  await page.getByRole("button", { name: /^تفاصيل يوسف/ }).click();
  const bar = page.getByRole("toolbar", { name: /إجراءات المحدَّدين/ });
  await expect(bar).toContainText("محدَّد: 2");
  if (shot("select-bar")) await page.screenshot({ path: shot("select-bar")! });
  await bar.getByRole("button", { name: "حاضر" }).click();
  await expect(bar).toBeHidden();
  await expect
    .poll(() => calls.filter((c) => c.path === "/rest/v1/rpc/set_daily_attendance_bulk").length)
    .toBe(1);
  expect(
    calls.filter((c) => c.path === "/rest/v1/rpc/set_daily_attendance_bulk")[0]?.body,
  ).toMatchObject({
    _rows: [
      { student: "s2", status: "present" },
      { student: "s1", status: "present" },
    ],
  });
  await expect(
    page.getByRole("radiogroup", { name: "حضور أحمد" }).getByRole("radio", { name: "حاضر" }),
  ).toHaveAttribute("aria-checked", "true");

  // نصف شاشة الإنهاء: أسماء النواقص تفتح لوحة الطالب مباشرة.
  await page.getByRole("button", { name: "إنهاء سجل اليوم" }).click();
  const finish = page.getByRole("dialog", { name: "إنهاء سجل اليوم" });
  await expect(finish).toBeVisible();
  if (shot("finish-sheet")) await page.screenshot({ path: shot("finish-sheet")! });
  await finish.getByRole("button", { name: "تفاصيل يوسف" }).click();
  await expect(finish).toBeHidden();
  const yusufSheet = page.getByRole("dialog", { name: "يوسف" });
  await expect(yusufSheet).toBeVisible();
  await yusufSheet.getByRole("button", { name: "إغلاق", exact: true }).click();
  await expect(yusufSheet).toBeHidden();

  // رمز الحضور في نصف شاشة من «المزيد» (والشاشة الكاملة رابط فيها).
  await page.getByRole("button", { name: "المزيد" }).click();
  await page
    .getByRole("dialog", { name: "المزيد" })
    .getByRole("button", { name: "رمز الحضور" })
    .click();
  const code = page.getByRole("dialog", { name: "رمز الحضور" });
  await expect(code).toBeVisible();
  await expect(code.getByRole("link", { name: "فتح في شاشة كاملة" })).toHaveAttribute(
    "href",
    new RegExp(`attendance-code\\?halaqa=${H}`),
  );
  await code.getByRole("button", { name: "إغلاق", exact: true }).click();
  await expect(code).toBeHidden();
});
