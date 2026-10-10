import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 8.1: وضع الحفظ من قائمة الآية، بالنص المضمَّن بلا أي طلب خارجي، و«أتقنتُها» عبر apply_review.
test("وضع الحفظ: إخفاء متدرّج وكشف باللمس وإضافة إلى المراجعة", async ({ page, context }) => {
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      apply_review: [{ due_date: "2026-10-01", interval_days: 1, ease: 2.5, repetitions: 1 }],
    },
  });
  await seedSession(context, STUDENT);
  const external: string[] = [];
  await context.route(
    (url) => url.hostname !== "localhost" && url.hostname !== "sb.e2e.test",
    (route) => {
      external.push(route.request().url());
      return route.abort();
    },
  );

  await gotoReady(page, "/mushaf/read?surah=67&ayah=1");
  const area = page.getByLabel("منطقة قراءة الآيات");
  await expect(area).toContainText("سورةالملك", { timeout: 20_000 });
  await area.locator('[data-ayah="1"]').first().click();
  await page.getByRole("button", { name: "ابدأ الحفظ من هنا" }).click();

  await expect(page.getByRole("heading", { name: "وضع الحفظ" })).toBeVisible();
  await expect(page.getByText("الآيات ١–٥")).toBeVisible();
  const text = page.getByLabel("نص الحفظ");
  await expect(text.locator("[data-ayah]")).toHaveCount(5);

  // المستوى 4: كل الكلمات مخفية، واللمس يكشف كلمة.
  await page.getByRole("radio", { name: "إخفاء الآية كلها" }).click();
  const hidden = text.locator("[data-hidden-word]");
  const before = await hidden.count();
  expect(before).toBeGreaterThan(20);
  await hidden.first().click();
  await expect(hidden).toHaveCount(before - 1);

  // جدول التكرار.
  await expect(page.getByLabel("جدول التكرار")).toContainText("ربط 1–2");

  await page.getByRole("button", { name: /أتقنتُها/ }).click();
  await expect(page.getByText(/أُضيف إلى المراجعة/)).toBeVisible();
  const call = calls.find((c) => c.path === "/rest/v1/rpc/apply_review");
  expect(call?.body).toMatchObject({
    _student_id: STUDENT.id,
    _surah_name: "الملك",
    _from_ayah: 1,
    _to_ayah: 5,
    _score: 95,
  });
  expect(external.filter((u) => !/fonts\.g|everyayah|quranicaudio/.test(u))).toEqual([]);
});
