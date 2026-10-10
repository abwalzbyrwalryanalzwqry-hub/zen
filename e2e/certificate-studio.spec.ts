import { expect, test, type BrowserContext } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// استوديو الشهائد — الاختبار العملي الكامل: الرئيسية الفارغة ← إصدار جماعي لـ 30 طالباً (لكل طالب بياناته)
// ← إصدار فردي ← عرض الشهادة من لقطتها ← الإلغاء بسبب ← التحقق عبر رمز QR (صحيحة/ملغاة/غير موجودة).

const H = "hhhh0000-0000-4000-8000-0000000000c1";
const C = "cccc0000-0000-4000-8000-0000000000c1";
const shot = (name: string) => (process.env.SHOTS ? `${process.env.SHOTS}/${name}.png` : undefined);

const FIRST = ["عبدالرحمن", "إسماعيل", "موسى", "يوسف", "إبراهيم", "عمر"];
const LAST = ["أحمد نعمان", "مختار البدر", "محمد عبدالرؤوف", "صالح الحميري", "علي الأهدل"];
const STUDENTS = Array.from({ length: 30 }, (_, i) => ({
  id: `s${String(i + 1).padStart(2, "0")}`,
  name: `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]} ${i + 1}`,
  member: true,
}));

const TYPES = [
  ["participation", "شهادة مشاركة", "participation", null, []],
  ["appreciation", "شهادة شكر وتقدير", "thanks", null, []],
  ["attendance", "شهادة حضور", "attendance", null, [{ kind: "attendedDays", gte: 1 }]],
].map(([key, name, category, param, conditions], i) => ({
  id: `t${i}`,
  key,
  center_id: null,
  name,
  category,
  text_kind: category,
  param,
  conditions,
  texts: null,
  sort: i,
  active: true,
}));

function reportData(body: { _from: string; _to: string }) {
  const date = body._to;
  return {
    halaqa: { id: H, name: "حلقة الفجر", teacher_name: "الأستاذ يحيى", center_name: "مركز النور" },
    from: body._from,
    to: body._to,
    today: body._to,
    generated_at: new Date().toISOString(),
    schedule: [],
    students: STUDENTS,
    days: [{ date, status: "completed", notes: null }],
    rows: STUDENTS.map((s) => ({
      date,
      student_id: s.id,
      status: "present",
      reason: null,
      note: null,
      evaluation: { overall: 5 },
      memorize: { segments: [{ surah_name: "النبإ", from_ayah: 1, to_ayah: 20 }], score: 90 },
      review: null,
    })),
    history: [],
  };
}

type Issue = {
  halaqa_id: string;
  type_key: string;
  status: string;
  design: unknown;
  items: { student_id: string; vars?: Record<string, unknown> }[];
};

async function setup(context: BrowserContext) {
  const issued: { id: string; payload: Issue; item: Issue["items"][number]; n: number }[] = [];
  const revoked = new Map<string, string>();
  let seq = 123;
  const detail = (id: string) => {
    const c = issued.find((x) => x.id === id)!;
    const s = STUDENTS.find((x) => x.id === c.item.student_id)!;
    const number = `ZEN-2026-${String(c.n).padStart(6, "0")}`;
    const type = TYPES.find((x) => x.key === c.payload.type_key)!;
    return {
      id,
      certificate_number: number,
      status: revoked.has(id) ? "revoked" : "issued",
      student_id: s.id,
      student_name: s.name,
      center_id: C,
      center_name: "مركز النور",
      halaqa_id: H,
      halaqa_name: "حلقة الفجر",
      teacher_name: "الأستاذ يحيى",
      type_key: type.key,
      type_name: type.name,
      template_id: null,
      system_template: "royal_islamic",
      template_name: null,
      issue_date: "2026-10-07",
      created_at: "2026-10-07T10:00:00Z",
      issued_at: "2026-10-07T10:00:00Z",
      revoked_at: revoked.has(id) ? "2026-10-07T11:00:00Z" : null,
      revoke_reason: revoked.get(id) ?? null,
      batch_id: "b1",
      replaces_id: null,
      replaced_by: null,
      // أبجدية رمز التحقق بلا 0/1/O/I.
      verify_code: `CERT${String(c.n).padStart(12, "0")}`.replace(/0/g, "A").replace(/1/g, "B"),
      can_revoke: true,
      can_issue: true,
      period_from: null,
      period_to: null,
      archived_at: null,
      design_id: "d1",
      snapshot: {
        vars: {
          ...c.item.vars,
          student: { id: s.id.toUpperCase(), name: s.name, fullName: s.name },
          center: { name: "مركز النور" },
          circle: { name: "حلقة الفجر" },
          teacher: { name: "الأستاذ يحيى" },
          certificate: { number, date: "2026-10-07", type: type.name, verifyCode: "x" },
          period: { from: "", to: "" },
        },
        type: {
          key: type.key,
          name: type.name,
          category: type.category,
          text_kind: type.text_kind,
        },
        achievement_ref: null,
        override: false,
      },
      design: c.payload.design,
      assets: [],
    };
  };
  const fake = await installFakeSupabase(context, {
    user: TEACHER,
    rpc: {
      halaqa_report_data: (b: unknown) => reportData(b as never) as never,
      cert_studio_context: () => ({
        centers: [{ id: C, name: "مركز النور", can_manage: false, can_view: true }],
        halaqat: [
          {
            id: H,
            name: "حلقة الفجر",
            center_id: C,
            teacher_id: TEACHER.id,
            teacher_name: "الأستاذ يحيى",
            can_issue: true,
            students: 30,
          },
        ],
        types: TYPES,
      }),
      cert_templates: () => [],
      cert_assets: () => [],
      cert_brand: () => ({
        center: { id: C, name: "مركز النور", city: null },
        brand: null,
        report_colors: null,
        can_edit: false,
      }),
      cert_stats: () => ({
        total: issued.length,
        month: issued.length,
        year: issued.length,
        issued: issued.length,
        revoked: revoked.size,
        archived: 0,
        drafts: 0,
        students: new Set(issued.map((x) => x.item.student_id)).size,
        by_type: [],
        by_halaqa: [],
        by_template: [],
        by_month: [],
      }),
      cert_list: () => ({ total: issued.length, items: issued.map((x) => detail(x.id)) }),
      cert_issue: (b: unknown) => {
        const p = (b as { _payload: Issue })._payload;
        const out = p.items.map((item) => {
          const id = `cert-${seq}`;
          issued.push({ id, payload: p, item, n: seq++ });
          return detail(id);
        });
        return { batch_id: "b1", design_id: "d1", status: "issued", certificates: out };
      },
      cert_get: (b: unknown) => detail((b as { _id: string })._id),
      cert_get_many: (b: unknown) => {
        const ids = (b as { _ids: string[] })._ids;
        const all = ids.filter((id) => issued.some((x) => x.id === id)).map(detail);
        return {
          items: all.map(({ design: _d, assets: _a, ...rest }) => rest),
          designs: Object.fromEntries(all.map((x) => [x.design_id, x.design])),
          assets: [],
        };
      },
      cert_revoke: (b: unknown) => {
        const { _id, _reason } = b as { _id: string; _reason: string };
        revoked.set(_id, _reason);
        return { ok: true };
      },
      verify_certificate: (b: unknown) => {
        const code = (b as { _code: string })._code;
        const c = issued.find((x) => detail(x.id).verify_code === code);
        if (!c) return { status: "invalid" };
        const d = detail(c.id);
        return {
          status: d.status === "revoked" ? "revoked" : "valid",
          kind: "studio",
          certificate_number: d.certificate_number,
          student_name: d.student_name,
          center_name: d.center_name,
          halaqa_name: d.halaqa_name,
          type_name: d.type_name,
          issue_date: d.issue_date,
          revoked_at: d.revoked_at,
        };
      },
    } as never,
  });
  await seedSession(context, TEACHER);
  return { ...fake, issued, detail };
}

test("استوديو الشهائد: إصدار جماعي لـ 30 طالباً وفردي ثم الإلغاء والتحقق عبر QR", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const fake = await setup(context);

  // الرئيسية قبل أي إصدار: الحالة الفارغة المطلوبة حرفياً.
  await gotoReady(page, "/certificates");
  await expect(page.getByText("لم يتم إصدار أي شهادات بعد.")).toBeVisible();

  // ── الإصدار الجماعي: الحلقة ← النوع ← الطلاب ← القالب ← المعاينة والفحص ← الإصدار ──
  await page.getByRole("link", { name: "شهادة جديدة" }).first().click();
  await page.getByRole("button", { name: /حلقة الفجر/ }).click();
  await page.getByRole("button", { name: /شهادة مشاركة/ }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "تحديد الكل" }).click();
  await expect(page.getByText("30 طالب محدد")).toBeVisible();
  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByRole("tab", { name: "فاخرة" })).toBeVisible();
  await page.screenshot({ path: shot("cert-gallery") });
  await page.getByRole("button", { name: "المعاينة" }).last().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("1 من 30");
  // الترتيب ترتيب سجل الإنجاز نفسه؛ كل معاينة باسم طالبها وحده (لا تداخل بين الطلاب).
  const title = dialog.locator("h2").first();
  const nameOf = async () => (await title.innerText()).split(" — ").pop()!.trim();
  const n1 = await nameOf();
  expect(STUDENTS.map((x) => x.name)).toContain(n1);
  await dialog.getByRole("button", { name: "فحص الشهادة" }).click();
  await expect(dialog).toContainText("كل الشهائد جاهزة (30)");
  await expect(dialog).toContainText("✓");
  await dialog.getByRole("button", { name: "التالي" }).click();
  await expect(dialog).toContainText("2 من 30");
  const n2 = await nameOf();
  expect(n2).not.toBe(n1);
  expect(STUDENTS.map((x) => x.name)).toContain(n2);
  const page2 = await dialog.locator(".cert-page").first().innerText();
  expect(page2).toContain(n2);
  expect(page2).not.toContain(n1);
  await page.screenshot({ path: shot("cert-preview") });
  await dialog.getByRole("button", { name: "إصدار 30 شهادة" }).click();
  await expect(page.getByText("صدرت 30 شهادة")).toBeVisible();

  const call = fake.calls.find((c) => c.path === "/rest/v1/rpc/cert_issue")!;
  const payload = (call.body as { _payload: Issue })._payload;
  expect(payload.halaqa_id).toBe(H);
  expect(payload.type_key).toBe("participation");
  expect(payload.status).toBe("issued");
  expect(payload.items).toHaveLength(30);
  expect(new Set(payload.items.map((i) => i.student_id)).size).toBe(30);
  // بيانات الطالب والمركز والرقم يكتبها الخادم وحده في اللقطة، لا العميل.
  for (const i of payload.items) {
    expect(i.vars?.student).toBeUndefined();
    expect(i.vars?.certificate).toBeUndefined();
  }
  // التصميم مجمَّد: لا مراجع هوية غير محلولة تُرسل للخادم.
  expect(JSON.stringify(payload.design)).not.toContain("brand:");
  const numbers = fake.issued.map((x) => fake.detail(x.id).certificate_number);
  expect(new Set(numbers).size).toBe(30);
  await expect(page.getByText(numbers[29])).toBeVisible();

  // ── الإصدار الفردي من مدخل الطالب ──
  await gotoReady(
    page,
    `/certificates/new?halaqa=${H}&student=${STUDENTS[4].id}&type=appreciation`,
  );
  await expect(page.getByText("1 طالب محدد")).toBeVisible();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "المعاينة" }).last().click();
  await expect(page.getByRole("dialog")).toContainText(STUDENTS[4].name);
  await page.getByRole("dialog").getByRole("button", { name: "إصدار الشهادة" }).click();
  await expect(page.getByText("صدرت 1 شهادة")).toBeVisible();
  const single = fake.issued.at(-1)!;
  expect(single.item.student_id).toBe(STUDENTS[4].id);

  // ── عرض الشهادة من لقطتها، ثم إلغاؤها بسبب (لا حذف) ──
  const first = fake.issued[0];
  const firstName = fake.detail(first.id).student_name;
  await gotoReady(page, `/certificates/${first.id}`);
  await expect(page.getByRole("img", { name: new RegExp(firstName) })).toBeVisible();
  await expect(page.getByText(numbers[0]).first()).toBeVisible();
  await page.screenshot({ path: shot("cert-view") });
  await page.getByRole("button", { name: "إلغاء الشهادة" }).click();
  const rd = page.getByRole("dialog");
  await rd.getByLabel("سبب الإلغاء").fill("خطأ في نوع الإنجاز");
  await rd.getByRole("button", { name: "إلغاء الشهادة" }).click();
  await expect(page.getByText("أُلغيت الشهادة")).toBeVisible();
  expect(fake.calls.find((c) => c.path === "/rest/v1/rpc/cert_revoke")?.body).toEqual({
    _id: first.id,
    _reason: "خطأ في نوع الإنجاز",
  });

  // ── التحقق عبر رابط QR: صحيحة، ملغاة، غير موجودة ──
  const second = fake.detail(fake.issued[1].id);
  await gotoReady(page, `/verify?code=${second.verify_code}`);
  const card = page.getByRole("region", { name: "نتيجة التحقق" });
  await expect(card).toContainText("شهادة صحيحة");
  await expect(card).toContainText(second.certificate_number);
  await expect(card).toContainText(second.student_name);
  await expect(card).toContainText("حلقة الفجر");
  await gotoReady(page, `/verify?code=${fake.detail(first.id).verify_code}`);
  await expect(page.getByRole("region", { name: "نتيجة التحقق" })).toContainText("شهادة ملغاة");
  await gotoReady(page, "/verify?code=ZZZZZZZZZZZZZZZZ");
  await expect(page.getByRole("region", { name: "نتيجة التحقق" })).toContainText("شهادة غير صالحة");
});

// 1.25.0 (فحص الاستوديو M7/L5): على الجوال يبدأ المصمم بـ«تعديل سريع»، واللوحة لا تغطي ما بعدها.
test("استوديو الشهائد على الجوال: تعديل سريع ولوحة لا تتداخل مع الإعدادات", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 412, height: 915 });
  await setup(context);
  await gotoReady(page, "/certificates/new");
  await page.getByRole("button", { name: /حلقة الفجر/ }).click();
  await page.getByRole("button", { name: /شهادة مشاركة/ }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "تحديد الكل" }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "تخصيص التصميم" }).click();
  const quick = page.getByRole("button", { name: "تعديل سريع" });
  await expect(quick).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("نصوص الشهادة")).toBeVisible();
  // شريط الأدوات مخفي في التعديل السريع ويظهر في المصمم الكامل.
  await expect(page.getByRole("toolbar")).toHaveCount(0);
  await page.getByRole("button", { name: "المصمم الكامل" }).click();
  await expect(page.getByRole("toolbar")).toBeVisible();
  const canvas = await page
    .locator("[data-page]")
    .first()
    .evaluate((el) => {
      let box: HTMLElement | null = el.parentElement;
      while (box && getComputedStyle(box).overflow !== "auto") box = box.parentElement;
      return box!.getBoundingClientRect().bottom;
    });
  const aside = await page
    .locator("aside")
    .filter({ has: page.getByRole("tablist") })
    .boundingBox();
  expect(aside).not.toBeNull();
  expect(canvas).toBeLessThanOrEqual(aside!.y + 1);
  await page.screenshot({ path: shot("cert-mobile-designer") });
});
