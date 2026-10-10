import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 7.5: تقسيم شاشة القارئ بلا تغيير سلوك. هذا الاختبار يمرّ على كل جزء نُقل إلى ملفه:
// الشريط العلوي، واختيار السورة والجزء، ومنطقة القراءة، وقائمة الآية، وتبديل الوضع، وشريط الأدوات.
test("قارئ المصحف: السورة والجزء والآية والوضعان", async ({ page, context }) => {
  await installFakeSupabase(context, { user: STUDENT });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/mushaf/read?surah=112&ayah=1");

  const area = page.getByLabel("منطقة قراءة الآيات");
  await expect(area).toContainText("سورةالإخلاص", { timeout: 20_000 });
  await expect(page.getByLabel("التقدم في السورة")).toContainText("من ٤");

  // اختيار السورة بالبحث المطبَّع.
  await page.getByRole("button", { name: /^السورة\s*الإخلاص/ }).click();
  await page.getByPlaceholder("ابحث باسم السورة أو رقمها").fill("الفلق");
  await page.getByRole("button", { name: /الفلق/ }).click();
  await expect(area).toContainText("سورةالفلق", { timeout: 20_000 });

  // قائمة الآية.
  await area.locator('[data-ayah="1"]').first().click();
  await expect(page.getByRole("button", { name: /تفسير/ }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // اختيار الجزء ينقل إلى بدايته.
  await page.getByRole("button", { name: /^الجزء\s*[٠-٩]/ }).click();
  await page.getByRole("button", { name: /الجزء\s*٣٠/ }).click();
  await expect(area).toContainText(/سورة\s*النب/, { timeout: 20_000 });

  // تبديل الوضع مع الحفاظ على الموضع، ثم الرجوع.
  await page.getByRole("button", { name: "المصحف", exact: true }).click();
  await expect(page.getByRole("region", { name: "وضع المصحف" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "السورة", exact: true }).click();
  await expect(area).toContainText(/سورة\s*النب/, { timeout: 20_000 });

  // شريط الأدوات: علامة على الآية الظاهرة.
  await page.getByRole("button", { name: /وضع علامة على سورة/ }).click();
  await expect(page.getByRole("button", { name: /إزالة العلامة عن سورة/ })).toBeVisible();
});
