import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// جاهزية المستودع العام (N-03): الذكاء الاصطناعي النصّي يسأل قبل أول طلب، والقاصر لا يُرسل شيئاً.

test("المساعد: لا يُرسل شيء قبل الموافقة، والموافقة تحتاج إقرار العمر", async ({
  page,
  context,
}) => {
  const asked: string[] = [];
  let state: Record<string, boolean> = { text_ai: false, text_ai_effective: false };
  let saved: unknown = null;
  await installFakeSupabase(context, {
    user: STUDENT,
    tables: { ai_conversations: [], ai_messages: [] },
    rpc: {
      my_ai_usage: 0,
      my_ai_consent: () => state,
      set_text_ai_consent: (b: unknown) => {
        saved = b;
        const on = (b as { _on: boolean })._on;
        const adult = (b as { _age_13_plus: boolean })._age_13_plus;
        state = { text_ai: on, text_ai_effective: on && adult };
        return state;
      },
    },
    functions: {
      "zen-ai": (body: unknown) => {
        asked.push(JSON.stringify(body));
        return { conversationId: "c1", messageId: "m1", text: "وعليكم السلام", remaining: 119 };
      },
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/assistant");
  await expect(page.getByTestId("text-ai-consent-status")).toContainText("متوقف");

  const input = page.getByLabel("سؤالك للمساعد");
  await input.fill("السلام عليكم");
  await input.press("Enter");
  const dialog = page.getByTestId("text-ai-consent");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("دون 13 سنة");
  await dialog.getByRole("button", { name: "ليس الآن" }).click();
  await expect(dialog).toBeHidden();
  expect(asked).toEqual([]);

  await input.fill("السلام عليكم");
  await input.press("Enter");
  await expect(dialog.getByTestId("text-ai-consent-agree")).toBeDisabled();
  await dialog.getByTestId("text-ai-consent-age").check();
  await dialog.getByTestId("text-ai-consent-agree").click();
  await expect(page.getByText("وعليكم السلام")).toBeVisible();
  expect(saved).toEqual({ _on: true, _age_13_plus: true });
  expect(asked).toHaveLength(1);
});

test("القاصر المرتبط بوليّ أمر: شرح بدل التفعيل، ولا يُرسل شيء", async ({ page, context }) => {
  const asked: string[] = [];
  await installFakeSupabase(context, {
    user: STUDENT,
    tables: { ai_conversations: [], ai_messages: [] },
    rpc: {
      my_ai_usage: 0,
      my_ai_consent: { text_ai: false, text_ai_effective: false, minor: true, has_guardian: true },
    },
    functions: {
      "zen-ai": (body: unknown) => {
        asked.push(JSON.stringify(body));
        return { conversationId: "c1", messageId: "m1", text: "x", remaining: 1 };
      },
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/assistant");
  const input = page.getByLabel("سؤالك للمساعد");
  await input.fill("سؤال");
  await input.press("Enter");
  const dialog = page.getByTestId("text-ai-consent");
  await expect(dialog.getByTestId("text-ai-consent-minor")).toBeVisible();
  await dialog.getByRole("button", { name: "حسناً" }).click();
  await expect(dialog).toBeHidden();
  expect(asked).toEqual([]);
});

test("تحليل التلاوة مطفأ (recite_ai): التسجيل يُرسل للمعلّم مباشرة بلا تحليل، والتسميع المباشر مخفي", async ({
  page,
  context,
}) => {
  const actions: string[] = [];
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    tables: {
      feature_flags: [{ key: "recite_ai", enabled: false, rollout: 0, note: null }],
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
  await expect(page.getByRole("link", { name: /التسميع المباشر/ })).toHaveCount(0);
  await page.getByRole("button", { name: "ابدأ التسجيل" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "إيقاف" }).click();
  await expect(page.getByText("التحليل الآلي للتلاوة غير مفعّل حالياً")).toBeVisible();
  await expect(page.getByRole("button", { name: "تحليل التلاوة" })).toHaveCount(0);
  await page.getByTestId("recite-send-only").click();
  await expect(page.getByText("أُرسل تسجيلك إلى معلّمك.")).toBeVisible();
  expect(actions).toEqual([]);
  expect(
    calls.some((c) => c.path.startsWith(`/storage/v1/object/recitations/${STUDENT.id}/`)),
  ).toBe(true);
  expect(calls.some((c) => c.method === "PATCH" && c.path === "/rest/v1/recitation_sessions")).toBe(
    true,
  );

  await gotoReady(page, "/recite/live?surah=112&from=1&to=4");
  await expect(page.getByTestId("live-recite-off")).toBeVisible();
});
