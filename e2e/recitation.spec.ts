import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

test("التسميع الذاتي: تسجيل، رفع، مقارنة، ملاحظات إرشادية، ثم إرسال للمعلّم", async ({
  page,
  context,
}) => {
  const reference =
    "صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ";
  // التحليل في دالة Edge «zen-recitation» (المرحلة 6.2) لا في دالة خادم.
  const actions: string[] = [];
  // موافقة التحليل الآلي للصوت (P0-05): مطفأة حتى يوافق الطالب في الحوار.
  let consent = false;
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      my_ai_consent: () => ({ memo_context: false, recitation_audio: consent }),
      set_recitation_ai_consent: (b: unknown) => {
        consent = (b as { _on: boolean })._on;
        return { memo_context: false, recitation_audio: consent };
      },
    },
    functions: {
      "zen-recitation": (body: unknown) => {
        const action = (body as { action: string }).action;
        actions.push(action);
        return action === "transcribe"
          ? {
              transcript: "صراط الذين انعمت عليهم غير المغضوب عليهم ولا",
              reference,
              label: "سورة الفاتحة [7–7]",
              score: 88,
              weakSpots: ["الآية 7: «الضالين»"],
            }
          : { text: "أحسنت، راجع آخر الآية." };
      },
    },
  });
  await seedSession(context, STUDENT);

  await gotoReady(page, "/recite");
  await page.getByRole("button", { name: "ابدأ التسجيل" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "إيقاف" }).click();
  await expect(page.getByText("التسجيل جاهز")).toBeVisible();
  await page.getByRole("button", { name: "تحليل التلاوة" }).click();

  // أول تحليل يسأل عن الموافقة قبل أي رفع أو نداء، و«ليس الآن» لا يرسل شيئاً.
  const dialog = page.getByTestId("recitation-consent");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("خدمة ذكاء اصطناعي خارجية");
  await dialog.getByRole("button", { name: "ليس الآن" }).click();
  await expect(dialog).toBeHidden();
  expect(actions).toEqual([]);
  expect(calls.some((c) => c.path.startsWith("/storage/v1/object/recitations/"))).toBe(false);
  await expect(page.getByTestId("recitation-consent-status")).toContainText("متوقف");

  await page.getByRole("button", { name: "تحليل التلاوة" }).click();
  await page.getByRole("button", { name: "أوافق وأبدأ التحليل" }).click();
  expect(consent).toBe(true);

  await expect(page.getByText("88%")).toBeVisible();
  await expect(page.getByText("ملاحظات تجويد إرشادية")).toBeVisible();
  await expect(page.getByText("مدّ لازم")).toBeVisible();
  await expect(page.getByText("موضع اختلاف")).toBeVisible(); // «الضالين» ناقصة
  await expect(page.getByText("أحسنت، راجع آخر الآية.")).toBeVisible();

  // الصوت رُفع إلى مجلد الطالب، والجلسة أُنشئت «تدريباً» لا تصل المعلّم بعد.
  expect(
    calls.some((c) => c.path.startsWith(`/storage/v1/object/recitations/${STUDENT.id}/`)),
  ).toBe(true);
  const created = calls.find(
    (c) => c.method === "POST" && c.path === "/rest/v1/recitation_sessions",
  );
  expect(created?.body).toMatchObject({
    student_id: STUDENT.id,
    surah_name: "الفاتحة",
    status: "practice",
  });
  expect(actions).toEqual(["transcribe", "coach"]);

  await page.getByRole("button", { name: "إرسال إلى معلّمي للاعتماد" }).click();
  await expect
    .poll(() =>
      calls.some((c) => c.method === "PATCH" && c.path === "/rest/v1/recitation_sessions"),
    )
    .toBe(true);
});

test("القاصر (القرار 0011): موافقته تُحفظ وينتظر وليّ أمره، ولا يُرسل صوت للتحليل", async ({
  page,
  context,
}) => {
  const actions: string[] = [];
  let own = false;
  let sent: unknown = null;
  const state = () => ({
    memo_context: false,
    recitation_audio: own,
    age_13_plus: false,
    minor: true,
    has_guardian: true,
    guardian_recitation: false,
    recitation_effective: false,
  });
  await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      my_ai_consent: () => state(),
      set_recitation_ai_consent: (b: unknown) => {
        sent = b;
        own = (b as { _on: boolean })._on;
        return state();
      },
    },
    functions: {
      "zen-recitation": (body: unknown) => {
        actions.push((body as { action: string }).action);
        return {};
      },
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/recite");
  await page.getByRole("button", { name: "ابدأ التسجيل" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "إيقاف" }).click();
  await page.getByRole("button", { name: "تحليل التلاوة" }).click();

  const dialog = page.getByTestId("recitation-consent");
  await expect(dialog).toContainText("موافقة وليّ أمرك");
  await expect(dialog.getByTestId("recitation-consent-age")).not.toBeChecked();
  await dialog.getByRole("button", { name: "أوافق وأبدأ التحليل" }).click();
  expect(sent).toEqual({ _on: true, _age_13_plus: false });
  await expect(dialog.getByTestId("recitation-consent-guardian")).toContainText(
    "بعد أن يوافق وليّ أمرك",
  );
  await dialog.getByRole("button", { name: "حسناً" }).click();
  await expect(dialog).toBeHidden();
  expect(actions).toEqual([]);

  // المحاولة التالية تشرح الانتظار مباشرة دون سؤال جديد.
  await page.getByRole("button", { name: "تحليل التلاوة" }).click();
  await expect(page.getByTestId("recitation-consent-guardian")).toBeVisible();
  expect(actions).toEqual([]);
});
