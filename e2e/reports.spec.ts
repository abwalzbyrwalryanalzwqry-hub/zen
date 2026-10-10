import { expect, test, type Page } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";
import { installOfflineSwitch } from "./offline-net";

// الإصدار 1.11.0: سجل الإنجاز داخل السجل اليومي، ومعالج التقارير، والمعاينة بصفحات A4، وPDF وExcel.
// المسار الكامل: السجل ← سجل الإنجاز ← تقرير الطالب ← المعاينة ← تعديل ← المعاينة ← PDF ← Excel ← مشاركة.

const H = "hhhh0000-0000-4000-8000-000000000011";
const shot = (name: string) => (process.env.SHOTS ? `${process.env.SHOTS}/${name}.png` : undefined);

const STUDENTS = [
  { id: "s1", name: "عبدالرحمن أحمد نعمان", member: true },
  { id: "s2", name: "إسماعيل مختار البدر", member: true },
  { id: "s3", name: "موسى محمد عبدالرؤوف", member: true },
];

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const work = (surah_name: string, from_ayah: number, to_ayah: number, score: number) => ({
  segments: [{ surah_name, from_ayah, to_ayah }],
  score,
  error_type: null,
  notes: null,
});

/** بيانات halaqa_report_data للنطاق المطلوب: حتى 12 يوماً من بدايته، والسابق فارغ. */
function reportData(body: { _from: string; _to: string; _history?: boolean }) {
  const rows: unknown[] = [];
  const days: unknown[] = [];
  const history: unknown[] = [];
  const past = body._to < new Date().toISOString().slice(0, 10).slice(0, 8) + "01";
  for (let i = 0; !past && i < 12; i++) {
    const date = addDays(body._from, i);
    if (date > body._to) break;
    days.push({ date, status: "completed", notes: null });
    const m1 = work("البقرة", i * 12 + 1, i * 12 + 12, 92);
    const m2 = i < 5 ? work("يس", i * 17 + 1, Math.min(83, i * 17 + 17), 80) : null;
    rows.push(
      {
        date,
        student_id: "s1",
        status: "present",
        reason: null,
        note: i === 0 ? "متقن في التجويد" : null,
        evaluation: { overall: 5, tajweed: 4, pronunciation: 5, behavior: 5 },
        memorize: m1,
        review: i % 2 ? work("آل عمران", 1, 20, 88) : null,
      },
      {
        date,
        student_id: "s2",
        status: i === 1 ? "excused" : "present",
        reason: null,
        note: null,
        evaluation: { overall: 3 },
        memorize: m2,
        review: i >= 5 ? work("النبإ", 1, 40, 70) : null,
      },
      {
        date,
        student_id: "s3",
        status: i % 2 ? "absent" : "present",
        reason: null,
        note: null,
        evaluation: null,
        memorize: null,
        review: null,
      },
    );
    history.push({ ...m1.segments[0], student_id: "s1", date });
    if (m2) history.push({ ...m2.segments[0], student_id: "s2", date });
  }
  return {
    halaqa: { id: H, name: "حلقة الفجر", teacher_name: "الأستاذ يحيى", center_name: "مركز النور" },
    from: body._from,
    to: body._to,
    today: body._to,
    generated_at: new Date().toISOString(),
    schedule: [
      { weekday: 0, start: "16:00:00", end: "18:00:00" },
      { weekday: 3, start: "16:00:00", end: "18:00:00" },
    ],
    students: STUDENTS,
    days,
    rows,
    history: body._history ? history : [],
  };
}

async function setup(
  page: Page,
  context: import("@playwright/test").BrowserContext,
  rpc: Record<string, unknown> = {},
) {
  const fake = await installFakeSupabase(context, {
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
    rpc: { halaqa_report_data: (b: unknown) => reportData(b as never) as never, ...rpc } as never,
  });
  await seedSession(context, TEACHER);
  return fake;
}

/** كل صفحة A4 لا يفيض محتواها، وعددها في التذييل صحيح. */
function previewBody(page: Page) {
  return page.frameLocator('iframe[title="معاينة صفحات التقرير"]').locator("body");
}

async function checkPages(page: Page) {
  const frame = page.frameLocator('iframe[title="معاينة صفحات التقرير"]');
  await expect(frame.locator("section.page").first()).toBeVisible();
  const handle = await page.locator('iframe[title="معاينة صفحات التقرير"]').elementHandle();
  const f = await handle!.contentFrame();
  const info = await f!.evaluate(() => {
    const pages = [...document.querySelectorAll<HTMLElement>("section.page")];
    return {
      n: pages.length,
      overflow: pages.filter((p) => {
        const c = p.querySelector<HTMLElement>(".content")!;
        return c.scrollHeight > c.clientHeight + 1;
      }).length,
      dir: document.documentElement.dir,
      footer: pages.map((p) => p.querySelector(".ftr .pn")?.textContent ?? ""),
      font: getComputedStyle(document.body).fontFamily,
      text: document.body.innerText,
    };
  });
  expect(info.n).toBeGreaterThan(0);
  expect(info.overflow).toBe(0);
  expect(info.dir).toBe("rtl");
  expect(info.font).toContain("Zen Text");
  expect(info.footer[0]).toMatch(/^الصفحة ١ من [١-٩]/);
  return info;
}

test("سجل الإنجاز: ملخص الحلقة وإنجاز الطالب وخريطة السور والمحطات", async ({ page, context }) => {
  await setup(page, context);
  await gotoReady(page, `/teacher/register?halaqa=${H}&view=achievement`);
  await expect(page.getByRole("tab", { name: "سجل الإنجاز" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("region", { name: "ملخص الحلقة" })).toBeVisible();
  for (const s of STUDENTS) await expect(page.getByText(s.name)).toBeVisible();
  // موسى يتكرر غيابه: يحتاج متابعة بسبب صريح.
  await page.getByRole("button", { name: /موسى محمد عبدالرؤوف/ }).click();
  await expect(page.getByRole("note", { name: "يحتاج متابعة" })).toContainText(
    /تكرر الغياب|نسبة الحضور/,
  );
  // 1.14.0: ملخص الطالب نصف شاشة فوق القائمة؛ الإغلاق يعود إليها.
  await page.getByRole("dialog").getByRole("button", { name: "إغلاق", exact: true }).click();
  await page.getByRole("button", { name: /إسماعيل مختار البدر/ }).click();
  await expect(page.getByRole("list", { name: "خريطة السور" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^يس: مكتمل/ })).toBeVisible();
  if (shot("achievement")) await page.screenshot({ path: shot("achievement")!, fullPage: true });
});

test("التقارير: المسار الكامل من تقرير الطالب إلى PDF وExcel والمشاركة", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await gotoReady(page, `/teacher/register?halaqa=${H}&view=achievement`);
  await page.getByRole("button", { name: /عبدالرحمن أحمد نعمان/ }).click();
  await page.getByRole("link", { name: "تقرير الطالب" }).click();
  await expect(page).toHaveURL(/\/teacher\/reports\?/);
  // 1.15.0: تقرير الطالب من سجل الإنجاز يفتح المعاينة مباشرة.
  const preview = page.getByRole("button", { name: "معاينة التقرير" });
  const first = await checkPages(page);
  expect(first.text).toContain("تقرير طالب");
  expect(first.text).toContain("عبدالرحمن أحمد نعمان");
  expect(first.text).not.toContain("موسى محمد عبدالرؤوف");
  if (shot("preview")) await page.screenshot({ path: shot("preview")! });

  // تعديل ← العنوان ← المعاينة: الإعدادات محفوظة والعنوان الجديد في الصفحات.
  // 1.15.0: التخصيص نصف شاشة فوق المعاينة، والقالب بطاقات مرئية.
  await page.getByRole("button", { name: "تخصيص الشكل" }).click();
  const custom = page.getByRole("dialog", { name: "تخصيص الشكل" });
  await expect(custom.getByRole("radio", { name: "مختصر" })).toBeVisible();
  await custom.getByLabel("عنوان التقرير").fill("تقرير ولي الأمر");
  await custom.getByRole("button", { name: /هوية التقرير/ }).click();
  const identity = page.getByRole("dialog", { name: "هوية التقرير" });
  await expect(identity.getByRole("radiogroup", { name: "التقويم" })).toBeVisible();
  if (shot("identity")) await page.screenshot({ path: shot("identity")! });
  await identity.getByRole("button", { name: "تم" }).click();
  await expect(page.frameLocator('iframe[title="معاينة صفحات التقرير"]').locator("h1")).toHaveText(
    "تقرير ولي الأمر",
  );
  const second = await checkPages(page);
  expect(second.text).toContain("تقرير ولي الأمر");

  // PDF: نافذة الطباعة بالمستند نفسه، ثم PDF حقيقي بخط مضمّن ونص لا صورة.
  const popupP = page.waitForEvent("popup");
  await page.getByRole("button", { name: "تحميل PDF" }).click();
  const popup = await popupP;
  await popup.waitForLoadState();
  await expect(popup.locator("section.page").first()).toBeVisible();
  await popup.evaluate(() => document.fonts.ready);
  const pdf = await popup.pdf({ preferCSSPageSize: true, printBackground: true });
  const raw = pdf.toString("latin1");
  if (process.env.SHOTS)
    (await import("node:fs")).writeFileSync(`${process.env.SHOTS}/report.pdf`, pdf);
  expect(raw.startsWith("%PDF-")).toBe(true);
  const pageCount = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pageCount).toBe(second.n);
  // الخط مضمّن (Chromium يضمّن الخط باسمه الأصلي) والنص قابل للاستخراج (ToUnicode).
  expect(raw).toMatch(/MarkaziText/i);
  expect(raw).toContain("/ToUnicode");
  expect(raw).not.toMatch(/\/Subtype\s*\/Image/);
  await popup.close();

  // Excel من «المزيد» باسم ملف عربي فيه العنوان واسم الطالب والفترة.
  await expect(
    page.getByText(/^اسم الملف: تقرير ولي الأمر - عبدالرحمن أحمد نعمان - /),
  ).toBeVisible();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "المزيد" }).click();
  await page
    .getByRole("dialog", { name: "المزيد" })
    .getByRole("button", { name: "تحميل Excel" })
    .click();
  const x = await dl;
  expect(x.suggestedFilename()).toMatch(/^تقرير ولي الأمر - عبدالرحمن أحمد نعمان - .+\.xlsx$/);
  const fs = await import("node:fs");
  const buf = fs.readFileSync((await x.path())!);
  expect(buf.subarray(0, 2).toString()).toBe("PK");

  // مشاركة بلا مشاركة ويب: تنزيل الملف.
  const dl2 = page.waitForEvent("download");
  await page.getByRole("button", { name: "مشاركة" }).click();
  expect((await dl2).suggestedFilename()).toMatch(/\.xlsx$/);

  // آخر إعدادات محفوظة: إعادة الفتح تعيد العنوان.
  await gotoReady(page, `/teacher/reports?halaqa=${H}`);
  await preview.click();
  await page.getByRole("button", { name: "تخصيص الشكل" }).click();
  await expect(
    page.getByRole("dialog", { name: "تخصيص الشكل" }).getByLabel("عنوان التقرير"),
  ).toHaveValue("تقرير ولي الأمر");
});

test("التقارير: حالة لا بيانات، وتعذّر الإنشاء مع إعادة المحاولة", async ({ page, context }) => {
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
    rpc: {
      halaqa_report_data: (b: unknown) =>
        ({ ...reportData(b as never), days: [], rows: [], history: [] }) as never,
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/teacher/reports?halaqa=${H}`);
  await page.getByRole("button", { name: "معاينة التقرير" }).click();
  await expect(page.getByText("لا توجد بيانات ضمن النطاق المحدد.")).toBeVisible();
  await page.getByRole("button", { name: "تعديل نطاق التقرير" }).click();
  await expect(page.getByRole("radiogroup", { name: "النطاق الزمني" })).toBeVisible();
});

test("التقارير: خطأ الخادم يُظهر «تعذر إنشاء التقرير حاليًا.» وإعادة المحاولة", async ({
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
    fail: { rpc: ["halaqa_report_data"] },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/teacher/reports?halaqa=${H}`);
  await page.getByRole("button", { name: "معاينة التقرير" }).click();
  await expect(page.getByText("تعذر إنشاء التقرير حاليًا.")).toBeVisible();
  await expect(page.getByRole("button", { name: "أعد المحاولة" })).toBeVisible();
});

test("التقارير 1.15.0: تقرير الحلقة في ضغطتين، والطلاب والتاريخ أنصاف شاشات بلا قوائم منسدلة", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await gotoReady(page, `/teacher/reports?halaqa=${H}`);
  await expect(page.locator("select")).toHaveCount(0);
  for (const k of ["تقرير الحلقة", "تقرير طالب", "تقرير الحضور والغياب", "تقرير الإنجاز"])
    await expect(page.getByRole("radio", { name: new RegExp(k) })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(4 + 4);
  if (shot("setup")) await page.screenshot({ path: shot("setup")!, fullPage: true });

  // الطلاب: نصف شاشة باختيار يدوي وتصفية شرائح.
  await page.getByRole("button", { name: /كل الطلاب/ }).click();
  const sheet = page.getByRole("dialog", { name: "الطلاب" });
  await sheet.getByRole("radio", { name: "اختيار يدوي" }).click();
  await sheet.getByRole("button", { name: "إلغاء التحديد" }).click();
  await sheet.getByRole("checkbox", { name: /إسماعيل مختار البدر/ }).click();
  await expect(sheet.getByRole("radiogroup", { name: "الترتيب" })).toBeVisible();
  if (shot("students-sheet")) await page.screenshot({ path: shot("students-sheet")! });
  await sheet.getByRole("button", { name: "تم" }).click();
  await expect(page.getByRole("button", { name: /١ طلاب مختارون/ })).toBeVisible();

  // التاريخ المخصص: نصف شاشة باختصارات.
  await page.getByRole("radio", { name: "مخصص" }).click();
  const range = page.getByRole("dialog", { name: "النطاق الزمني" });
  await range.getByRole("radio", { name: "آخر 30 يومًا" }).click();
  await range.getByRole("button", { name: "تم" }).click();
  await expect(page.getByRole("radio", { name: "مخصص" })).toHaveAttribute("aria-checked", "true");

  // إيقاف كل الأقسام يمنع المعاينة.
  const sections = page.getByRole("list", { name: "الأقسام" }).getByRole("checkbox");
  const n = await sections.count();
  for (let i = 0; i < n; i++)
    if ((await sections.nth(i).getAttribute("aria-checked")) === "true")
      await sections.nth(i).click();
  await expect(page.getByRole("button", { name: "معاينة التقرير" })).toBeDisabled();
  await sections.first().click();

  await page.getByRole("button", { name: "معاينة التقرير" }).click();
  const info = await checkPages(page);
  expect(info.text).toContain("إسماعيل مختار البدر");
  expect(info.text).not.toContain("موسى محمد عبدالرؤوف");
  await page.getByRole("button", { name: "الفترة والطلاب" }).click();
  await expect(page.getByRole("radiogroup", { name: "نوع التقرير" })).toBeVisible();
});

test("التقارير 1.15.0: هوية المركز تُقرأ من الخادم وتُحفظ له، وألوان جاهزة بنقرة", async ({
  page,
  context,
}) => {
  const fake = await setup(page, context, {
    report_identity: {
      identity: { header: { text: "مجمع النور القرآني" } },
      can_edit: true,
    },
    set_report_identity: null,
  });
  await gotoReady(page, `/teacher/reports?halaqa=${H}`);
  await page.getByRole("button", { name: "معاينة التقرير" }).click();
  const info = await checkPages(page);
  expect(info.text).toContain("مجمع النور القرآني");
  await page.getByRole("button", { name: "تخصيص الشكل" }).click();
  await page.getByRole("button", { name: /هوية التقرير/ }).click();
  const identity = page.getByRole("dialog", { name: "هوية التقرير" });
  await expect(identity.getByText(/تُحفظ للمركز كله/)).toBeVisible();
  await expect(identity.getByRole("radio", { name: "أخضر زِن" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await identity.getByRole("radio", { name: "عنابي" }).click();
  await expect(identity.getByRole("radio", { name: "عنابي" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  if (shot("identity-presets")) await page.screenshot({ path: shot("identity-presets")! });
  await expect
    .poll(() =>
      fake.calls.some(
        (c) =>
          c.path.endsWith("/rpc/set_report_identity") &&
          JSON.stringify(c.body).includes("#7a1f2b") &&
          JSON.stringify(c.body).includes("مجمع النور القرآني"),
      ),
    )
    .toBe(true);
});

test("التقارير 1.15.0: كرر آخر تقرير ومفضلة مسمّاة تفتح المعاينة بضغطة", async ({
  page,
  context,
}) => {
  await setup(page, context);
  await gotoReady(page, `/teacher/reports?halaqa=${H}`);
  await expect(page.getByRole("button", { name: /كرر آخر تقرير/ })).toHaveCount(0);
  await page.getByRole("radio", { name: /تقرير الحضور والغياب/ }).click();
  await page.getByRole("radio", { name: "هذا الأسبوع" }).click();
  await page.getByRole("button", { name: "حفظ هذا التقرير في المفضلة" }).click();
  const sheet = page.getByRole("dialog", { name: "حفظ هذا التقرير في المفضلة" });
  await sheet.getByLabel("اسم التقرير").fill("حضور الأسبوع");
  await sheet.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByRole("button", { name: /^حضور الأسبوع/ })).toBeVisible();

  // تصدير يجعل التقرير «آخر تقرير».
  await page.getByRole("radio", { name: /تقرير الحلقة/ }).click();
  await page.getByRole("radio", { name: "هذا الشهر" }).click();
  await page.getByRole("button", { name: "معاينة التقرير" }).click();
  await checkPages(page);
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "المزيد" }).click();
  await page
    .getByRole("dialog", { name: "المزيد" })
    .getByRole("button", { name: "تحميل Excel" })
    .click();
  await dl;

  // بعد العودة: المفضل يفتح المعاينة بنوعه وفترته، و«كرر آخر تقرير» يعيد تقرير الحلقة.
  await gotoReady(page, `/teacher/reports?halaqa=${H}`);
  if (shot("shortcuts")) await page.screenshot({ path: shot("shortcuts")! });
  await page.getByRole("button", { name: /^حضور الأسبوع/ }).click();
  // المعاينة تُبقي الصفحات السابقة حتى يكتمل البناء الجديد، فننتظر عنوان التقرير المطلوب ثم نفحص.
  await expect(previewBody(page)).toContainText("تقرير الحضور والغياب");
  await checkPages(page);
  await page.getByRole("button", { name: "الفترة والطلاب" }).click();
  await expect(page.getByRole("radio", { name: "هذا الأسبوع" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("button", { name: /كرر آخر تقرير/ }).click();
  await expect(previewBody(page)).toContainText("تقرير الحلقة");
  await checkPages(page);

  await page.getByRole("button", { name: "الفترة والطلاب" }).click();
  await page.getByRole("button", { name: "حذف «حضور الأسبوع» من المفضلة" }).click();
  await expect(page.getByRole("button", { name: /^حضور الأسبوع/ })).toHaveCount(0);
});

test("دون اتصال (1.16.0): التقرير يُبنى من بيانات الجهاز مع تنبيه", async ({ page, context }) => {
  await setup(page, context);
  const net = await installOfflineSwitch(context);
  await gotoReady(page, `/teacher/register?halaqa=${H}&view=achievement`);
  await page.getByRole("button", { name: /عبدالرحمن أحمد نعمان/ }).click();
  await page.getByRole("link", { name: "تقرير الطالب" }).click();
  await checkPages(page);

  await net.set(page, true);
  await page.reload();
  await expect(
    page.getByText("لا اتصال: التقرير من بيانات محفوظة على الجهاز", { exact: false }),
  ).toBeVisible({
    timeout: 20_000,
  });
  const info = await checkPages(page);
  expect(info.text).toContain("عبدالرحمن أحمد نعمان");
});
