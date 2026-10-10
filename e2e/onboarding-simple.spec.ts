import { expect, test, type Page } from "@playwright/test";
import { STUDENT, TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// الإصدار 1.19.0 (المرحلة 3): «أول يوم لك»، والوضع المبسّط، والتحدي في رئيسية الطالب، وتلميح السحب وآخر سبب.

const teacherCtx = (p: Record<string, unknown> = {}) => ({
  account_kind: null,
  is_teacher: true,
  children: 0,
  halaqas_joined: 0,
  halaqas_taught: 1,
  center_staff: false,
  center_simple_mode: false,
  setup: { students: 3, records: false, guardians: false },
  active_challenge: null,
  ...p,
});
const shot = (n: string) => (process.env.SHOTS ? `${process.env.SHOTS}/${n}.png` : null);

test("أول يوم للمعلّم: الخطوات من السياق، والتالية مميَّزة، والإخفاء يبقى", async ({
  page,
  context,
}) => {
  await installFakeSupabase(context, {
    user: TEACHER,
    rpc: { my_home_context: teacherCtx() as never },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/today");
  const card = page.getByTestId("first-day");
  await expect(card).toContainText("2 من 4 خطوات");
  await expect(card.locator('[data-step="halaqa"]')).toHaveAttribute("data-done", "true");
  await expect(card.locator('[data-step="record"]')).toHaveAttribute("data-done", "false");
  await expect(card.locator('[data-step="record"]')).toContainText("ابدأ");
  await expect(card.locator('[data-step="guardian"]')).not.toContainText("ابدأ");
  if (shot("first-day")) await card.screenshot({ path: shot("first-day")! });
  await card.getByRole("button", { name: "إخفاء الخطوات" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "الرئيسية" }).first()).toBeVisible();
  await expect(page.getByTestId("first-day")).toHaveCount(0);
});

test("الوضع المبسّط: المركز يفعّله افتراضياً، والمعلّم يوقفه من «التفضيلات»", async ({
  page,
  context,
}) => {
  await installFakeSupabase(context, {
    user: TEACHER,
    rpc: {
      my_home_context: teacherCtx({
        center_simple_mode: true,
        setup: { students: 3, records: true, guardians: true },
      }) as never,
      more_badges: { notifications: 0, invites: 0, at_risk: 0 },
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/more");
  await expect(page.getByRole("link", { name: /السجل اليومي/ }).first()).toBeVisible();
  await expect(page.locator('a[href="/certificates"]')).toHaveCount(0);
  await expect(page.locator('a[href="/teacher/import"]')).toHaveCount(0);

  await gotoReady(page, "/settings/display");
  const box = page.getByTestId("simple-mode");
  await expect(page.getByText("(فعّلته إدارة مركزك)")).toBeVisible();
  await box.getByRole("radio", { name: "متوقف" }).click();
  await expect(page.getByText("الوضع المبسّط غير فعّال.")).toBeVisible();

  await gotoReady(page, "/more");
  await expect(page.locator('a[href="/certificates"]').first()).toBeVisible();
});

test("رئيسية الطالب: التحدي الجاري بتقدّمه وأيامه", async ({ page, context }) => {
  const today = new Date();
  const ends = new Date(today.getTime() + 5 * 86_400_000);
  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      my_home_context: {
        account_kind: "student",
        is_teacher: false,
        children: 0,
        halaqas_joined: 1,
        halaqas_taught: 0,
        center_staff: false,
        center_simple_mode: false,
        setup: null,
        active_challenge: {
          id: "c1",
          halaqa_id: "h1",
          title: "مئة صفحة في أسبوع",
          kind: "pages",
          target: 100,
          progress: 40,
          ends_on: key(ends),
        },
      } as never,
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/today");
  const card = page.getByTestId("active-challenge");
  await expect(card).toContainText("مئة صفحة في أسبوع");
  await expect(card).toContainText("قرأت الحلقة 40 من 100 صفحة");
  await expect(card).toContainText("بقي 5 يوماً");
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
  await card.click();
  await expect(page).toHaveURL(/\/achievements/);
});

const H = "hhhh0000-0000-4000-8000-000000000019";
const R = "rrrr0000-0000-4000-8000-000000000019";

async function swipe(page: Page, name: string, dx: number) {
  const btn = page.getByRole("button", { name: `تفاصيل ${name}` });
  const box = (await btn.boundingBox())!;
  const y = box.y + box.height / 2;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y);
  await page.mouse.up();
}

test("السجل اليومي: تلميح السحب يُغلق مرة، وآخر سبب للطالب بلمسة", async ({ page, context }) => {
  await context.addInitScript(() => {
    if (!localStorage.getItem("zen-last-reason"))
      localStorage.setItem("zen-last-reason", JSON.stringify({ s3: "علاج أسبوعي" }));
  });
  let students = [
    {
      student_id: "s3",
      name: "بلال",
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
    },
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
        return students[0] as never;
      },
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/teacher/register?halaqa=${H}`);
  const tip = page.locator('[data-tip="swipe"]');
  await expect(tip).toContainText("اسحب بطاقة الطالب");
  await tip.getByRole("button", { name: "إخفاء التلميح" }).click();
  await expect(tip).toHaveCount(0);

  await swipe(page, "بلال", 140);
  const sheet = page.getByRole("dialog", { name: "سبب استئذان بلال" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "آخر مرة: علاج أسبوعي" }).click();
  await expect(sheet).toBeHidden();
  await expect
    .poll(() =>
      calls
        .filter((c) => c.path === "/rest/v1/rpc/set_daily_attendance")
        .map((c) => (c.body as { _reason: string | null })._reason ?? ""),
    )
    .toEqual(["", "علاج أسبوعي"]);

  await page.reload();
  await expect(page.getByRole("button", { name: "تفاصيل بلال" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-tip="swipe"]')).toHaveCount(0);
});
