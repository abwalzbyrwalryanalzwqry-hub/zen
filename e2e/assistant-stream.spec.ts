import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

// المرحلة 12.1: المساعد يطلب البث ويعرض المقاطع ثم الرد النهائي بمعرّفه.
test("البث الحي للمساعد", async ({ page, context }) => {
  await installFakeSupabase(context, { user: STUDENT, rpc: { my_ai_usage: 2 } });
  const bodies: Array<Record<string, unknown>> = [];
  await context.route("**/functions/v1/zen-ai", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, body: "ok" });
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" },
      body:
        ev({ type: "start", conversationId: "c1" }) +
        ev({ type: "delta", text: "ابدأ بالتكرار " }) +
        ev({ type: "delta", text: "﴿…﴾ كل يوم." }) +
        ev({
          type: "done",
          conversationId: "c1",
          messageId: "m1",
          text: "ابدأ بالتكرار ﴿…﴾ كل يوم.",
          remaining: 117,
          stopped: false,
        }),
    });
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/assistant");
  await page.getByLabel("سؤالك للمساعد").fill("كيف أحفظ؟");
  await page.getByRole("button", { name: "إرسال" }).click();
  await expect(page.getByText("ابدأ بالتكرار ﴿…﴾ كل يوم.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "رد مفيد" })).toBeVisible();
  expect(bodies[0]).toMatchObject({ message: "كيف أحفظ؟", stream: true });
});

test("خطأ الحصة يصل عبر البث بالعربية", async ({ page, context }) => {
  await installFakeSupabase(context, { user: STUDENT, rpc: { my_ai_usage: 5 } });
  await context.route("**/functions/v1/zen-ai", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 200, body: "ok" })
      : route.fulfill({
          status: 200,
          headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" },
          body: ev({
            type: "error",
            error: "بلغت حدّ الاستخدام اليومي للمساعد (120 سؤالاً). عد غداً.",
            status: 429,
          }),
        }),
  );
  await seedSession(context, STUDENT);
  await gotoReady(page, "/assistant");
  await page.getByLabel("سؤالك للمساعد").fill("سؤال");
  await page.getByRole("button", { name: "إرسال" }).click();
  await expect(page.getByText("بلغت حدّ الاستخدام اليومي")).toBeVisible({ timeout: 20_000 });
});

test("«إيقاف» يلغي الطلب فعلاً", async ({ page, context }) => {
  await installFakeSupabase(context, { user: STUDENT, rpc: { my_ai_usage: 1 } });
  await context.route("**/functions/v1/zen-ai", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, body: "ok" });
    await new Promise(() => undefined); // الخادم لا يردّ: يبقى الطلب معلّقاً حتى الإلغاء
  });
  const failed = page.waitForEvent("requestfailed", (r) =>
    r.url().includes("/functions/v1/zen-ai"),
  );
  await seedSession(context, STUDENT);
  await gotoReady(page, "/assistant");
  await page.getByLabel("سؤالك للمساعد").fill("سؤال طويل");
  await page.getByRole("button", { name: "إرسال" }).click();
  await page.getByRole("button", { name: "إيقاف الرد" }).click();
  await failed;
  await expect(page.getByText("أُوقف الرد.")).toBeVisible();
  await expect(page.getByRole("button", { name: "إرسال" })).toBeVisible();
});

// المرحلة 12.2: موافقة سياق الحفظ تُمنح وتُسحب من شاشة المساعد.
test("موافقة سياق الحفظ", async ({ page, context }) => {
  let on = false;
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      my_ai_usage: 0,
      my_ai_consent: () => ({ memo_context: on, granted_at: null, revoked_at: null }),
      set_ai_consent: (b: unknown) => {
        on = (b as { _memo_context: boolean })._memo_context;
        return { memo_context: on, granted_at: "2026-09-29", revoked_at: on ? null : "2026-09-29" };
      },
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/assistant");
  const toggle = page.getByRole("button", { name: /سياق حفظي للمساعد/ });
  await expect(toggle).toContainText("غير مفعّل", { timeout: 20_000 });
  await toggle.click();
  await expect(page.getByRole("region", { name: "موافقة سياق الحفظ" })).toContainText(
    "لا يُرسل اسمك",
  );
  await page.getByRole("button", { name: "أوافق على استعمال سياق حفظي" }).click();
  await expect(toggle).toContainText("مفعّل");
  await toggle.click();
  await page.getByRole("button", { name: "سحب الموافقة" }).click();
  await expect(toggle).toContainText("غير مفعّل");
  const sets = calls.filter((c) => c.path === "/rest/v1/rpc/set_ai_consent").map((c) => c.body);
  expect(sets).toEqual([{ _memo_context: true }, { _memo_context: false }]);
});
