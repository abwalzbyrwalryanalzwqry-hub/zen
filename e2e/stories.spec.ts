import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

/**
 * قسم القصص الموسَّع (1.13.0): 25 قصة من النسخة المضمَّنة حين لا تصل قائمة الخادم، والبحث والتصفية،
 * ونص الآيات داخل القصة، والاختبار بشرح الإجابة وإعادة المحاولة، والاستئناف من آخر حدث على الجهاز.
 */
test("القصص: القائمة والبحث والتصفية، ثم قصة يونس بآياتها واختبارها والاستئناف", async ({
  page,
  context,
}) => {
  await installFakeSupabase(context, {
    user: STUDENT,
    tables: { stories: [], story_progress: [] },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/stories");

  await expect(page.getByText("أتممت 0 من 25")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('a[href^="/stories/seed-"]')).toHaveCount(25);

  await page.getByRole("button", { name: "أولو العزم" }).click();
  await expect(page.locator('a[href^="/stories/seed-"]')).toHaveCount(5);
  await page.getByRole("button", { name: "الكل" }).click();

  await page.getByRole("searchbox", { name: "بحث في القصص" }).fill("يُونُس");
  await expect(page.locator('a[href^="/stories/seed-"]')).toHaveCount(1);
  await page.getByRole("searchbox", { name: "بحث في القصص" }).fill("لا يوجد هذا");
  await expect(page.getByText("لا توجد قصة تطابق البحث.")).toBeVisible();
  await page.getByRole("searchbox", { name: "بحث في القصص" }).fill("يونس");
  await page.getByRole("link", { name: /قصة يونس عليه السلام/ }).click();

  await expect(page.getByRole("heading", { name: "قصة يونس عليه السلام" })).toBeVisible();
  await expect(page.getByText("أهل نينوى")).toBeVisible();
  // نص الآيات من المصحف المضمَّن، ورابط المقطع في المصحف.
  await expect(page.locator(".font-quran").first()).toContainText("ٱلْمُرْسَلِينَ", {
    timeout: 20_000,
  });
  await expect(page.locator('a[href*="/mushaf/read"]').first()).toBeVisible();
  await expect(page.locator('a[href="https://quran.com/37/139-148"]')).toBeVisible();

  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByText("3 / 7")).toBeVisible();
  // الاستئناف: إعادة فتح القصة تبدأ من الحدث الثالث (التقدّم محفوظ على الجهاز للقصص المضمَّنة).
  await page.reload();
  await expect(page.getByText("3 / 7")).toBeVisible({ timeout: 20_000 });

  // إجابة خاطئة ثم الشرح وإعادة المحاولة.
  await page.getByRole("button", { name: "رب اغفر لي" }).click();
  await page.getByRole("button", { name: "اليقطين" }).click();
  await page.getByRole("button", { name: "مئة ألف أو يزيدون" }).click();
  await page.getByRole("button", { name: "عرض النتيجة" }).click();
  await expect(page.getByText("نتيجتك: 67%")).toBeVisible();
  await expect(
    page.getByText(/أن لا إله إلا أنت سبحانك إني كنت من الظالمين \(الأنبياء 87\)/),
  ).toBeVisible();
  await page.getByRole("button", { name: "أعد المحاولة" }).click();
  await expect(page.getByRole("button", { name: "عرض النتيجة" })).toBeDisabled();

  // إتمام الاختبار يجعل القصة مكتملة في القائمة.
  await page.getByRole("link", { name: "كل القصص" }).click();
  await expect(page.getByText("أتممت 1 من 25")).toBeVisible();
});
