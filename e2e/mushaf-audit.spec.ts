import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// إصلاحات تقرير فحص المصحف: التفسير والبحث على الموضع الحالي (H2)، وحقول تكرار المقطع (H3)،
// والنسخ إلى الحافظة فعلاً (H4)، والتقليب بلوحة المفاتيح و«الانتقال إلى» (M6/M12)، والبحث بالمرجع (M7).

test.beforeEach(async ({ context }) => {
  await installFakeSupabase(context, { user: STUDENT });
  await seedSession(context, STUDENT);
});

test("H2: التفسير والبحث من القارئ يفتحان على الآية والسورة المفتوحة", async ({ page }) => {
  await gotoReady(page, "/mushaf/read?surah=2&ayah=255");
  const area = page.getByLabel("منطقة قراءة الآيات");
  await expect(area.locator('[data-ayah="255"]')).toBeVisible({ timeout: 20_000 });

  const search = page.getByRole("link", { name: "البحث في سورة البقرة" });
  await expect(search).toHaveAttribute("href", /scope=surah/);
  await expect(search).toHaveAttribute("href", /surah=2/);

  await page.getByRole("button", { name: /^تفسير سورة البقرة، الآية/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("تفسير سورة البقرة");
  await expect(dialog).not.toContainText("الفاتحة");
});

test("H3: حقلا المقطع يقبلان الكتابة الحرة ويُقيَّدان عند الخروج", async ({ page }) => {
  await gotoReady(page, "/mushaf/read?surah=2&ayah=1");
  const area = page.getByLabel("منطقة قراءة الآيات");
  await area.locator('[data-ayah="3"]').first().click({ timeout: 20_000 });
  await page.getByRole("button", { name: "تكرار", exact: true }).click();

  const from = page.getByLabel("من الآية", { exact: true });
  await from.fill("");
  await from.pressSequentially("25");
  await expect(from).toHaveValue("25");

  const to = page.getByLabel("إلى الآية", { exact: true });
  await to.fill("999");
  await to.blur();
  await expect(to).toHaveValue("286");

  await page.getByRole("button", { name: "زيادة من الآية" }).click();
  await expect(from).toHaveValue("26");

  await to.fill("10");
  await expect(page.getByRole("alert")).toContainText("آية النهاية قبل آية البداية");
  await expect(page.getByRole("button", { name: "ابدأ التكرار" })).toBeDisabled();
});

test("H4: «نسخ نص الآية» ينسخ إلى الحافظة دون مربع المشاركة", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    (window as unknown as { __shared: number }).__shared = 0;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        (window as unknown as { __shared: number }).__shared++;
      },
    });
  });
  await gotoReady(page, "/mushaf/read?surah=112&ayah=1");
  await page
    .getByLabel("منطقة قراءة الآيات")
    .locator('[data-ayah="1"]')
    .first()
    .click({ timeout: 20_000 });
  await page.getByRole("button", { name: "نسخ نص الآية" }).click();
  await expect(page.getByRole("button", { name: "نُسخت الآية" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("الإخلاص");
  expect(await page.evaluate(() => (window as unknown as { __shared: number }).__shared)).toBe(0);
});

test("M6/M12: الأسهم تقلّب الصفحات، و«الانتقال إلى» يتحقق من الرقم ويفهم المرجع", async ({
  page,
}) => {
  await gotoReady(page, "/mushaf/read?mode=mushaf&page=300");
  const sheet = page.getByRole("region", { name: "وضع المصحف" });
  await expect(sheet).toContainText("صفحة ٣٠٠ من ٦٠٤", { timeout: 20_000 });

  await page.keyboard.press("ArrowLeft");
  await expect(sheet).toContainText("صفحة ٣٠١ من ٦٠٤");
  await page.keyboard.press("ArrowRight");
  await expect(sheet).toContainText("صفحة ٣٠٠ من ٦٠٤");

  await page.getByRole("button", { name: /صفحة ٣٠٠ من ٦٠٤ — انقر للانتقال/ }).click();
  const input = page.getByRole("dialog").getByRole("textbox");
  await input.fill("700");
  await page.getByRole("button", { name: "انتقال", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("بين ١ و٦٠٤");

  await page.getByRole("tab", { name: "آية" }).click();
  await input.fill("البقرة 255");
  await expect(page.getByRole("dialog")).toContainText("صفحة ٤٢");
  await page.getByRole("button", { name: "انتقال", exact: true }).click();
  await expect(sheet).toContainText("صفحة ٤٢ من ٦٠٤");
});

test("M7: البحث بالمرجع والأسماء المشهورة", async ({ page }) => {
  await gotoReady(page, "/mushaf/search");
  const box = page.getByPlaceholder("اكتب كلمة أو جزءًا من آية…");
  await box.fill("2:255");
  const ref = page.getByRole("link", { name: /سورة البقرة، الآية ٢٥٥/ });
  await expect(ref).toBeVisible();
  await expect(ref).toHaveAttribute("href", /ayah=255/);

  await box.fill("آية الكرسي");
  await expect(page.getByRole("link", { name: /سورة البقرة، الآية ٢٥٥/ })).toBeVisible();

  await box.fill("تبارك");
  await expect(page.getByRole("link", { name: "الملك", exact: true })).toBeVisible({
    timeout: 30_000,
  });
});
