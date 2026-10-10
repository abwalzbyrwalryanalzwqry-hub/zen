import { expect, test } from "@playwright/test";
import { STUDENT, TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// الإصدار 1.21.0 (المرحلة 5): دفتر الرسوم للمدير، وكشف وليّ الأمر وإرسال الإيصال، والتسميع عن بُعد.

const C = "c-fees";
const shot = (n: string) => (process.env.SHOTS ? `${process.env.SHOTS}/${n}.png` : null);
const rpcBody = (calls: { path: string; body: unknown }[], name: string) =>
  calls
    .filter((c) => c.path === `/rest/v1/rpc/${name}`)
    .map((c) => c.body as Record<string, unknown>);

test("دفتر الرسوم: المدير يؤكد إيصالاً ويسجّل مستحقاً لكل الطلاب بالأرقام العربية", async ({
  page,
  context,
}) => {
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    rpc: {
      center_fee_overview: {
        center_id: C,
        enabled: true,
        totals: {
          charged: 10000,
          paid: 2000,
          balance: 8000,
          overdue: 3000,
          students_due: 2,
          pending_receipts: 1,
        },
        students: [
          {
            student_id: "s1",
            name: "أحمد",
            halaqat: "حلقة الفجر",
            charged: 5000,
            paid: 2000,
            balance: 3000,
            overdue: 3000,
            last_paid: "2026-10-01",
            currency: "YER",
          },
          {
            student_id: "s2",
            name: "بلال",
            halaqat: "حلقة العصر",
            charged: 5000,
            paid: 0,
            balance: 5000,
            overdue: 0,
            last_paid: null,
            currency: "YER",
          },
        ],
      },
      center_fee_receipts: [
        {
          id: "r1",
          student_id: "s1",
          student_name: "أحمد",
          submitted_by_name: "أبو أحمد",
          by_guardian: true,
          amount: 3000,
          currency: "YER",
          reference: "TRX-77",
          image_path: null,
          note: null,
          status: "pending",
          decision_note: null,
          created_at: "2026-10-05T08:00:00Z",
        },
      ],
      fee_decide_receipt: { status: "confirmed" },
      fee_add_charges: 2,
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/center/${C}/fees`);
  await expect(page.getByRole("heading", { name: "دفتر الرسوم" })).toBeVisible();
  await expect(page.getByTestId("fee-receipt")).toContainText("TRX-77");
  await expect(page.getByText("من وليّ الأمر أبو أحمد")).toBeVisible();
  const s = shot("fees-center");
  if (s) await page.screenshot({ path: s });
  await page.getByRole("button", { name: "تأكيد" }).click();
  await expect.poll(() => rpcBody(calls, "fee_decide_receipt").length).toBe(1);
  expect(rpcBody(calls, "fee_decide_receipt")[0]).toMatchObject({ _id: "r1", _confirm: true });

  await page.getByRole("button", { name: "مستحق جديد" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("البيان").fill("رسوم شهر محرم");
  await dlg.getByLabel("المبلغ").fill("٥٬٠٠٠");
  await dlg.getByLabel("كل الطلاب (2)").check();
  await dlg.getByRole("button", { name: "تسجيل لـ 2 طالب" }).click();
  await expect.poll(() => rpcBody(calls, "fee_add_charges").length).toBe(1);
  const b = rpcBody(calls, "fee_add_charges")[0];
  expect(b._amount).toBe(5000);
  expect([...(b._students as string[])].sort()).toEqual(["s1", "s2"]);
});

test("كشف الرسوم: وليّ الأمر يرى المتبقي ويرسل رقم الحوالة", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      my_fee_centers: [
        {
          center_id: C,
          center_name: "مركز النور",
          student_id: STUDENT.id,
          student_name: "",
          self: true,
        },
      ],
      student_fee_statement: [
        {
          center_id: C,
          center_name: "مركز النور",
          charged: 5000,
          paid: 2000,
          currency: "YER",
          charges: [
            {
              id: "c1",
              title: "رسوم صفر",
              amount: 5000,
              currency: "YER",
              due_date: "2026-10-01",
              cancelled: false,
            },
          ],
          payments: [
            {
              id: "p1",
              amount: 2000,
              currency: "YER",
              method: "cash",
              reference: null,
              paid_on: "2026-10-02",
              source: "manual",
              voided: false,
            },
          ],
          receipts: [],
        },
      ],
      fee_submit_receipt: "r-new",
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/fees");
  const card = page.getByTestId("fee-statement");
  await expect(card).toContainText("رسوم مركز النور");
  await expect(card).toContainText("رسوم صفر");
  await card.getByRole("button", { name: "أرسلت دفعة" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByLabel("المبلغ")).toHaveValue("3000");
  await dlg.getByLabel("رقم الحوالة أو المرجع").fill("TRX-9");
  const s = shot("fees-family");
  if (s) await page.screenshot({ path: s });
  await dlg.getByRole("button", { name: "إرسال للتأكيد" }).click();
  await expect.poll(() => rpcBody(calls, "fee_submit_receipt").length).toBe(1);
  expect(rpcBody(calls, "fee_submit_receipt")[0]).toMatchObject({
    _center: C,
    _student: STUDENT.id,
    _amount: 3000,
    _reference: "TRX-9",
  });
});

const item = (o: Record<string, unknown>) => ({
  id: "rr1",
  halaqa_id: "h1",
  halaqa_name: "حلقة الفجر",
  teacher_name: "الأستاذ سالم",
  student_id: "s1",
  student_name: "أحمد",
  kind: "review",
  surah_name: "الملك",
  from_ayah: 1,
  to_ayah: 6,
  instructions: null,
  due_date: null,
  status: "submitted",
  audio_path: "s1/remote/rr1.webm",
  duration_seconds: 95,
  submitted_at: "2026-10-05T08:00:00Z",
  grade: null,
  mistakes: [],
  teacher_note: null,
  reviewed_at: null,
  created_at: "2026-10-04T08:00:00Z",
  ...o,
});

test("التسميع عن بُعد: المعلّم يعلّم الأخطاء بالنوع فتُرسل للسجل، والطالب يرى المراجعة", async ({
  page,
  context,
}) => {
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    rpc: {
      teacher_remote_queue: [item({})],
      remote_review: { record_date: "2026-10-05" },
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, "/teacher/remote");
  await expect(page.getByTestId("remote-submitted")).toContainText("أحمد");
  await page.getByRole("button", { name: "مراجعة", exact: true }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "الآية 3", exact: true }).click();
  await dlg.getByRole("button", { name: "الآية 3: خطأ حفظ" }).click();
  await dlg.getByRole("button", { name: "الآية 5", exact: true }).click();
  await expect(dlg.getByRole("button", { name: "الآية 3: خطأ تجويد" })).toBeVisible();
  const s = shot("remote-review");
  if (s) await page.screenshot({ path: s });
  await dlg.getByRole("button", { name: /حفظ في سجل اليوم/ }).click();
  await expect.poll(() => rpcBody(calls, "remote_review").length).toBe(1);
  const b = rpcBody(calls, "remote_review")[0];
  expect(b._mistakes).toEqual([
    { ayah: 3, type: "tajweed" },
    { ayah: 5, type: "hifz" },
  ]);
  expect(b._grade).toBe(2); // خطآن في 6 آيات (33%) ⇒ الدرجة المقترحة 2
});

test("التسميع عن بُعد للطالب: المقطع المطلوب والمراجعة بأخطائها", async ({ page, context }) => {
  await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      my_remote_recitations: [
        item({
          id: "a1",
          status: "assigned",
          audio_path: null,
          duration_seconds: null,
          instructions: "رتّل",
        }),
        item({
          id: "a2",
          status: "reviewed",
          grade: 4,
          mistakes: [{ ayah: 2, type: "hifz" }],
          teacher_note: "أحسنت",
        }),
      ],
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/recite/remote");
  await expect(page.getByTestId("remote-assigned")).toContainText("رتّل");
  const done = page.getByTestId("remote-done");
  await expect(done).toContainText("الدرجة 4 من 5");
  await expect(done).toContainText("حفظ: 2");
  await expect(done).toContainText("أحسنت");
  await expect(page.getByRole("button", { name: "إرسال التسجيل" })).toBeDisabled();
});
