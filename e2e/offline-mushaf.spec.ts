import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// تطبيق Android فقط (6.10): المصحف كاملاً داخل الحزمة (dist-native/client/data/quran/mushaf15) مع
// خطّه، فيُقرأ دون أي تنزيل ولا نطاق خارجي. الاختبار يمنع كل طلب خارج الحزمة وSupabase الوهمي.
test("المصحف مضمَّن في حزمة التطبيق ويُقرأ بلا أي طلب خارجي", async ({ page, context }) => {
  await installFakeSupabase(context, { user: STUDENT });
  await seedSession(context, STUDENT);
  const external: string[] = [];
  const pages: string[] = [];
  await context.route(
    (url) => url.hostname !== "localhost" && url.hostname !== "sb.e2e.test",
    (route) => {
      external.push(route.request().url());
      return route.abort();
    },
  );
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (/\/data\/quran\/mushaf15\/\d+\.json$/.test(url.pathname)) pages.push(url.host);
  });

  await gotoReady(page, "/about");
  await expect(page.getByText("مضمَّنة في التطبيق")).toBeVisible();
  await expect(page.getByRole("button", { name: "تنزيل المصحف كاملاً" })).toHaveCount(0);

  await gotoReady(page, "/mushaf/read?mode=mushaf&page=600");
  const sheet = page.getByRole("region", { name: "وضع المصحف" });
  await expect(sheet).toContainText("ٱلۡقَارِعَةُ", { timeout: 20_000 });
  await page.getByRole("button", { name: "الصفحة التالية" }).click();
  await expect(sheet).toContainText("وَٱلۡعَصۡرِ");

  expect(pages.length).toBeGreaterThan(0);
  expect(new Set(pages)).toEqual(new Set([new URL(page.url()).host]));
  expect(external.filter((u) => /quran_pages|jsdelivr|fonts\.g/.test(u))).toEqual([]);
});
