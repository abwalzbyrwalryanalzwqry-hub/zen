import { expect, test, type BrowserContext } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// السجل اليومي للحلقة (امتداد «سجل الحلقة» 9.1): بطاقات الطلاب، والحضور بلمسة متفائلة، ولوحة الطالب
// (حفظ ومراجعة وتقييم)، و«اختيار من المصحف»، والإنهاء بتنبيهات، والقراءة فقط بعد الإغلاق، وبلا اتصال.

const H = "hhhh0000-0000-4000-8000-000000000001";
const R = "rrrr0000-0000-4000-8000-000000000001";
const HALAQAT = [
  {
    id: H,
    center_id: "c1",
    name: "حلقة الفجر",
    teacher_id: TEACHER.id,
    schedule: null,
    created_at: "2026-01-01",
  },
];

type Row = Record<string, unknown>;
const row = (id: string, name: string, p: Row = {}): Row => ({
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

function sheetOf(status: string, students: Row[], extra: Row = {}) {
  return {
    halaqa: { id: H, name: "حلقة الفجر", teacher_name: "الأستاذ يحيى" },
    date: "2026-10-04",
    today: "2026-10-04",
    can_edit: true,
    can_lock: false,
    record: {
      id: R,
      status,
      version: 3,
      notes: null,
      completed_at: null,
      locked_at: null,
      completed_by_name: null,
    },
    students,
    ...extra,
  };
}

async function setup(
  context: BrowserContext,
  rpc: Parameters<typeof installFakeSupabase>[1]["rpc"],
) {
  const fake = await installFakeSupabase(context, {
    user: TEACHER,
    tables: { halaqat: HALAQAT },
    rpc,
  });
  await seedSession(context, TEACHER);
  return fake;
}

const shot = (name: string) => (process.env.SHOTS ? `${process.env.SHOTS}/${name}.png` : undefined);

test("السجل اليومي: حضور بلمسة، وحفظ من لوحة الطالب، واختيار من المصحف، ثم الإنهاء", async ({
  page,
  context,
}) => {
  let students = [
    row("s1", "أحمد", {
      last_memorize: { surah_name: "الملك", from_ayah: 1, to_ayah: 10, session_date: "2026-10-03" },
      absences_30d: 2,
    }),
    row("s2", "بلال"),
  ];
  let status = "open";
  const { calls } = await setup(context, {
    daily_record_sheet: () => sheetOf(status, students),
    set_daily_attendance: (b: unknown) => {
      const body = b as Row;
      students = students.map((s) =>
        s.student_id === body._student
          ? { ...s, status: body._status, version: (body._version as number) + 1 }
          : s,
      );
      return students.find((s) => s.student_id === body._student) as never;
    },
    save_daily_entry: (b: unknown) => {
      const body = b as { _student: string; _payload: Row; _version: number };
      const m = body._payload.memorize as { segments: Row[] } | null;
      students = students.map((s) =>
        s.student_id === body._student
          ? {
              ...s,
              status: s.status ?? "present",
              version: body._version + 1,
              memorize: m
                ? { segments: m.segments, score: 85, error_type: "none", notes: null }
                : null,
            }
          : s,
      );
      return students.find((s) => s.student_id === body._student) as never;
    },
    complete_daily_record: () => {
      status = "completed";
      return { id: R, status: "completed", version: 4 };
    },
  });

  await gotoReady(page, `/teacher/register?halaqa=${H}`);
  await expect(page.getByRole("heading", { name: "السجل اليومي للحلقة" })).toBeVisible();
  await expect(page.getByText("الأستاذ يحيى", { exact: false })).toBeVisible({ timeout: 20_000 });
  const ahmad = page.locator('[data-student="s1"]');
  await expect(ahmad).toContainText("آخر حفظ: الملك 1–10");
  await expect(page.getByRole("button", { name: /^تفاصيل أحمد.*غاب 2 في 30 يوماً/ })).toBeVisible();

  // الحضور: لمسة واحدة، يظهر فوراً، والنداء بنسخة السطر.
  const bilal = page.getByRole("radiogroup", { name: "حضور بلال" });
  await bilal.getByRole("radio", { name: "غائب" }).click();
  await expect(bilal.getByRole("radio", { name: "غائب" })).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() => calls.filter((c) => c.path === "/rest/v1/rpc/set_daily_attendance").length)
    .toBe(1);
  expect(calls.find((c) => c.path === "/rest/v1/rpc/set_daily_attendance")?.body).toMatchObject({
    _record: R,
    _student: "s2",
    _status: "absent",
    _version: 0,
  });

  // لوحة أحمد: الحفظ يبدأ مقترحاً بعد آخر حفظ.
  await page.getByRole("button", { name: "تفاصيل أحمد" }).click();
  const dialog = page.getByRole("dialog", { name: "أحمد" });
  await dialog.getByRole("button", { name: "إضافة حفظ" }).click();
  const memo = dialog.getByRole("region", { name: "الحفظ" });
  await expect(memo.getByLabel("من آية")).toHaveValue("11");
  // 1.35.0: البداية تكملة آخر تسجيل (الملك 1–10)، والنهاية للمعلّم وشبكتها مفتوحة، مع سطر «آخر ما سُجّل».
  await expect(memo.getByLabel("إلى آية")).toHaveValue("");
  await expect(memo.getByLabel("إلى آية")).toHaveAttribute("aria-expanded", "true");
  await expect(dialog.getByTestId("last-recorded-memorize")).toContainText("الملك الآية 10");
  // «اختيار من المصحف» بالبداية نفسها: لمسة واحدة على آية النهاية.
  await memo.getByRole("button", { name: "اختيار من المصحف" }).click();
  const memoPicker = page.getByRole("dialog", { name: "اختيار من المصحف" });
  await expect(memoPicker).toContainText("البداية: الملك 11");
  await memoPicker.getByRole("button", { name: "الملك 12" }).click();
  await expect(memoPicker).toContainText("الملك 11–12");
  await memoPicker.getByRole("button", { name: "اعتماد المدى" }).click();
  await expect(memoPicker).toBeHidden();
  await expect(memo.getByLabel("إلى آية")).toHaveValue("12");
  await expect(dialog.getByText("أكمل المدى ومستوى الأداء", { exact: false })).toBeVisible();
  await memo
    .getByRole("radiogroup", { name: "مستوى الأداء في الحفظ" })
    .getByRole("radio", { name: "جيد جداً" })
    .click();

  // المراجعة من المصحف: لمستان ثم اعتماد، والنموذج يبقى بما فيه.
  await dialog.getByRole("button", { name: "إضافة مراجعة" }).click();
  const review = dialog.getByRole("region", { name: "المراجعة" });
  await review.getByRole("button", { name: "اختيار من المصحف" }).click();
  const picker = page.getByRole("dialog", { name: "اختيار من المصحف" });
  await picker.getByRole("button", { name: "الفاتحة 2" }).click();
  await picker.getByRole("button", { name: "الفاتحة 4" }).click();
  await expect(picker).toContainText("الفاتحة 2–4");
  await picker.getByRole("button", { name: "اعتماد المدى" }).click();
  await expect(picker).toBeHidden();
  await expect(review.getByLabel("من آية")).toHaveValue("2");
  await expect(review.getByLabel("إلى آية")).toHaveValue("4");
  await expect(memo.getByLabel("إلى آية")).toHaveValue("12");
  await review.getByRole("button", { name: "حذف" }).click();

  // بلا زر «حفظ»: الحفظ تلقائي، والإغلاق يحفظ ما بقي.
  await dialog.getByRole("button", { name: "إغلاق", exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = calls.find((c) => c.path === "/rest/v1/rpc/save_daily_entry");
  expect(saved?.body).toMatchObject({
    _record: R,
    _student: "s1",
    _version: 0,
    _payload: {
      memorize: { segments: [{ surah_name: "الملك", from_ayah: 11, to_ayah: 12 }], grade: 4 },
    },
  });
  expect(calls.filter((c) => c.path === "/rest/v1/rpc/save_daily_entry")).toHaveLength(1);
  await expect(ahmad).toContainText("حفظ اليوم: الملك 11–12");

  // الملخص محسوب من البيانات، ثم الإنهاء بلا نواقص.
  const summary = page.getByRole("region", { name: "ملخص اليوم" });
  await expect(summary).toContainText("حفظوا 1");
  await page.getByRole("button", { name: "إنهاء سجل اليوم" }).click();
  const finish = page.getByRole("dialog", { name: "إنهاء سجل اليوم" });
  await expect(finish).toContainText("لا نواقص");
  await finish.getByRole("button", { name: "إنهاء", exact: true }).click();
  await expect(page.getByText("اكتمل سجل اليوم. أعد فتحه")).toBeVisible();
  await expect(
    page.getByRole("radiogroup", { name: "حضور أحمد" }).getByRole("radio", { name: "حاضر" }),
  ).toBeDisabled();
});

test("السجل المُغلق للقراءة فقط، وتعديل الحضور بلا اتصال ينتظر في الصندوق", async ({
  page,
  context,
}) => {
  await setup(context, {
    daily_record_sheet: sheetOf("locked", [row("s1", "أحمد", { status: "present", version: 1 })]),
  });
  await gotoReady(page, `/teacher/register?halaqa=${H}`);
  await expect(page.getByText("أُغلق هذا السجل نهائياً")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("radio", { name: "غائب" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "إنهاء سجل اليوم" })).toHaveCount(0);
});

test("بلا اتصال: الحضور يبقى ظاهراً ويُحفظ على الجهاز ثم يُرسل", async ({ page, context }) => {
  const { calls } = await setup(context, {
    daily_record_sheet: sheetOf("open", [row("s1", "أحمد")]),
    set_daily_attendance: row("s1", "أحمد", { status: "late", version: 1 }),
  });
  let offline = true;
  await context.route("**/rest/v1/rpc/set_daily_attendance", (route) =>
    offline ? route.abort("internetdisconnected") : route.fallback(),
  );
  await gotoReady(page, `/teacher/register?halaqa=${H}`);
  const group = page.getByRole("radiogroup", { name: "حضور أحمد" });
  await group.getByRole("radio", { name: "متأخر" }).click({ timeout: 20_000 });
  await expect(page.getByText("1 تعديل بانتظار الإرسال")).toBeVisible();
  await expect(group.getByRole("radio", { name: "متأخر" })).toHaveAttribute("aria-checked", "true");
  offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("أُرسل 1 تعديل محفوظ على الجهاز.")).toBeVisible();
  const sent = calls.filter((c) => c.path === "/rest/v1/rpc/set_daily_attendance");
  expect(sent.at(-1)?.body).toMatchObject({ _student: "s1", _status: "late", _version: 0 });
});

test("حلقة لا يملكها المستخدم: رسالة صلاحية لا شاشة فارغة", async ({ page, context }) => {
  await setup(context, {});
  await context.route("**/rest/v1/rpc/daily_record_sheet", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ code: "P0001", message: "NOT_YOUR_HALAQA" }),
    }),
  );
  await gotoReady(page, `/teacher/register?halaqa=${H}`);
  await expect(page.getByText("لا تملك صلاحية عرض سجل هذه الحلقة.")).toBeVisible({
    timeout: 20_000,
  });
});

test("المرحلة 1: فتح ضمني، و«الجميع حاضر» مع التراجع، والتصفية، والأيام في الرابط", async ({
  page,
  context,
}) => {
  let students = [row("s1", "أحمد"), row("s2", "بلال"), row("s3", "إسلام")];
  let record: Row | null = null;
  const { calls } = await setup(context, {
    daily_record_sheet: () => ({ ...sheetOf("open", students), record }),
    daily_record_week: (b: unknown) => {
      const to = (b as { _to: string })._to;
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(`${to}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 6 + i);
        const day = d.toISOString().slice(0, 10);
        return { date: day, status: i === 6 && record ? "open" : null };
      }) as never;
    },
    open_daily_record: () => {
      record = {
        id: R,
        status: "open",
        version: 1,
        notes: null,
        completed_at: null,
        locked_at: null,
        completed_by_name: null,
      };
      return { id: R, status: "open", version: 1 } as never;
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
  });

  await gotoReady(page, `/teacher/register?halaqa=${H}`);
  // لا خطوة «فتح سجل اليوم»: القائمة ظاهرة مع تنبيه الفتح التلقائي.
  await expect(page.getByText("يُفتح سجل اليوم تلقائياً عند أول تسجيل.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "فتح سجل اليوم" })).toHaveCount(0);
  await page.getByRole("button", { name: "الجميع حاضر (3)" }).click();
  await expect
    .poll(() => calls.filter((c) => c.path === "/rest/v1/rpc/set_daily_attendance_bulk").length)
    .toBe(1);
  expect(calls.filter((c) => c.path === "/rest/v1/rpc/open_daily_record")).toHaveLength(1);
  await expect(
    page.getByRole("radiogroup", { name: "حضور بلال" }).getByRole("radio", { name: "حاضر" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "تراجع" }).click();
  await expect
    .poll(() => calls.filter((c) => c.path === "/rest/v1/rpc/set_daily_attendance_bulk").length)
    .toBe(2);
  expect(
    calls.filter((c) => c.path === "/rest/v1/rpc/set_daily_attendance_bulk")[1]?.body,
  ).toMatchObject({
    _rows: [
      { student: "s1", status: null, version: 1 },
      { student: "s2", status: null, version: 1 },
      { student: "s3", status: null, version: 1 },
    ],
  });
  await expect(page.getByRole("button", { name: "الجميع حاضر (3)" })).toBeVisible();
  if (shot("register")) await page.screenshot({ path: shot("register")! });

  // البحث بلا همزات.
  await page.getByRole("searchbox", { name: "ابحث عن طالب" }).fill("اسلام");
  await expect(page.locator("[data-student]")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "ابحث عن طالب" }).fill("");

  // 1.14.0: التاريخ يفتح تقويم الشهر في نصف شاشة؛ اليوم الحالي مختار وما بعده معطّل.
  await page.getByRole("button", { name: /^اختيار اليوم/ }).click();
  const cal = page.getByRole("dialog", { name: "اختر اليوم" });
  await expect(cal.locator('[aria-current="date"]')).toHaveCount(1);
  if (shot("date-sheet")) await page.screenshot({ path: shot("date-sheet")! });
  await page.keyboard.press("Escape");
  await expect(cal).toBeHidden();
  // اليوم السابق: يتغيّر الرابط.
  await page.getByRole("button", { name: "اليوم السابق" }).click();
  await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/);
});

test("المرحلة 2: تأكيد غياب من له إنجاز، والسبب، وتجاهل المسودة، والإغلاق بنافذة", async ({
  page,
  context,
}) => {
  let students = [
    row("s1", "أحمد", {
      status: "present",
      version: 2,
      memorize: {
        segments: [{ surah_name: "الملك", from_ayah: 1, to_ayah: 5 }],
        score: 85,
        error_type: "none",
        notes: null,
      },
    }),
    row("s2", "بلال", { status: "absent", version: 1 }),
  ];
  let status = "open";
  const { calls } = await setup(context, {
    daily_record_sheet: () => ({ ...sheetOf(status, students), can_lock: true }),
    save_daily_entry: (b: unknown) => {
      const body = b as { _student: string; _version: number };
      students = students.map((s) =>
        s.student_id === body._student
          ? { ...s, memorize: null, review: null, version: body._version + 1 }
          : s,
      );
      return students.find((s) => s.student_id === body._student) as never;
    },
    set_daily_attendance: (b: unknown) => {
      const body = b as Row;
      students = students.map((s) =>
        s.student_id === body._student
          ? {
              ...s,
              status: body._status,
              reason: body._reason ?? s.reason,
              version: (body._version as number) + 1,
            }
          : s,
      );
      return students.find((s) => s.student_id === body._student) as never;
    },
    complete_daily_record: () => {
      status = "completed";
      return { id: R, status: "completed", version: 4 };
    },
    lock_daily_record: () => {
      status = "locked";
      return { id: R, status: "locked", version: 5 };
    },
  });
  await gotoReady(page, `/teacher/register?halaqa=${H}`);

  // غياب من له حفظ اليوم: نافذة تأكيد، ثم حذف الإنجاز ثم الحالة.
  const ahmad = page.getByRole("radiogroup", { name: "حضور أحمد" });
  await ahmad.getByRole("radio", { name: "غائب" }).click({ timeout: 20_000 });
  const ask = page.getByRole("dialog", { name: "تسجيل أحمد غائباً؟" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "احذف وسجّل" }).click();
  await expect(ask).toBeHidden();
  await expect(ahmad.getByRole("radio", { name: "غائب" })).toHaveAttribute("aria-checked", "true");
  const order = calls
    .map((c) => c.path)
    .filter((p) => /save_daily_entry|set_daily_attendance$/.test(p));
  expect(order).toEqual(["/rest/v1/rpc/save_daily_entry", "/rest/v1/rpc/set_daily_attendance"]);

  // السبب من رقاقة، ويظهر على البطاقة.
  await page.getByRole("button", { name: "تفاصيل بلال" }).click();
  const dialog = page.getByRole("dialog", { name: "بلال" });
  await dialog.getByRole("button", { name: "مرض" }).click();
  await dialog.getByRole("button", { name: "تم" }).click();
  await expect(dialog).toBeHidden();
  expect(
    calls.filter((c) => c.path === "/rest/v1/rpc/set_daily_attendance").at(-1)?.body,
  ).toMatchObject({ _student: "s2", _status: "absent", _reason: "مرض" });
  await expect(page.locator('[data-student="s2"]')).toContainText("السبب: مرض");

  // 1.14.0: الملاحظة تُحفظ تلقائياً، والإغلاق لا يسأل عمّا اكتمل.
  await page.getByRole("button", { name: "تفاصيل أحمد" }).click();
  const a = page.getByRole("dialog", { name: "أحمد" });
  await a.getByLabel("ملاحظة على الطالب").fill("تجربة");
  await expect(a.getByText("حُفظ تلقائياً", { exact: false })).toBeVisible();
  expect(
    calls.filter((c) => c.path === "/rest/v1/rpc/save_daily_entry").at(-1)?.body,
  ).toMatchObject({ _student: "s1", _payload: { note: "تجربة" } });
  await a.getByRole("button", { name: "إغلاق", exact: true }).click();
  await expect(a).toBeHidden();

  // الإنهاء ثم الإغلاق النهائي بنافذة التطبيق لا window.confirm.
  await page.getByRole("button", { name: "إنهاء سجل اليوم" }).click();
  await page
    .getByRole("dialog", { name: "إنهاء سجل اليوم" })
    .getByRole("button", { name: "إنهاء", exact: true })
    .click();
  // 1.14.0: الإغلاق النهائي في «المزيد» (نصف شاشة).
  await page.getByRole("button", { name: "المزيد" }).click();
  if (shot("more-sheet")) await page.screenshot({ path: shot("more-sheet")! });
  await page
    .getByRole("dialog", { name: "المزيد" })
    .getByRole("button", { name: /إغلاق نهائي/ })
    .click();
  const lock = page.getByRole("dialog", { name: "إغلاق السجل نهائياً؟ لن يمكن تعديله بعد ذلك." });
  await lock.getByRole("button", { name: "إغلاق نهائي" }).click();
  await expect(page.getByText("أُغلق هذا السجل نهائياً")).toBeVisible();
});

test("المرحلة 4: بلا اتصال تُعرض نسخة الجهاز، ومن انتقل للقراءة فقط", async ({ page, context }) => {
  await setup(context, {
    daily_record_sheet: sheetOf("open", [
      row("s1", "أحمد"),
      row("s2", "بلال", { status: "present", version: 1, member: false }),
    ]),
  });
  await gotoReady(page, `/teacher/register?halaqa=${H}`);
  const bilal = page.locator('[data-student="s2"]');
  await expect(bilal).toContainText("انتقل", { timeout: 20_000 });
  await expect(bilal.getByRole("radio", { name: "غائب" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "الجميع حاضر (1)" })).toBeVisible();

  // انقطاع الاتصال ثم إعادة التحميل: الورقة من الجهاز مع تنبيه، لا رسالة خطأ.
  await context.route("**/rest/v1/rpc/daily_record_sheet", (route) =>
    route.abort("internetdisconnected"),
  );
  await page.reload();
  await expect(
    page.getByText("لا اتصال: هذه نسخة محفوظة على الجهاز", { exact: false }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('[data-student="s1"]')).toBeVisible();
});

test("المرحلة 6: يوم سابق بالسهم، وإعادة فتح سجل مكتمل للتعديل", async ({ page, context }) => {
  let status = "completed";
  const dates: string[] = [];
  const fake = await setup(context, {
    daily_record_sheet: (body: unknown) => {
      const date = String((body as Row)._date ?? "2026-10-04");
      dates.push(date);
      return {
        ...sheetOf(status, [row("s1", "أحمد", { status: "present", version: 1 })]),
        date,
      };
    },
    daily_record_week: [],
    reopen_daily_record: () => {
      status = "open";
      return { id: R, status: "open", version: 4 };
    },
  });
  await gotoReady(page, `/teacher/register?halaqa=${H}&date=2026-10-04`);
  await expect(page.getByRole("button", { name: "إعادة فتح للتعديل" })).toBeVisible({
    timeout: 20_000,
  });
  // المكتمل للقراءة حتى يُعاد فتحه.
  await expect(page.getByRole("radio", { name: "غائب" })).toBeDisabled();

  await page.getByRole("button", { name: "اليوم السابق" }).click();
  await expect(page).toHaveURL(/date=2026-10-03/);
  await expect.poll(() => dates.includes("2026-10-03")).toBe(true);

  await page.getByRole("button", { name: "إعادة فتح للتعديل" }).click();
  await expect
    .poll(() => fake.calls.some((c) => c.path.endsWith("/reopen_daily_record")))
    .toBe(true);
  await expect(page.getByRole("button", { name: "إنهاء سجل اليوم" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "غائب" })).toBeEnabled();
});
