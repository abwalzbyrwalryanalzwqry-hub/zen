import { expect, test, type Page } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";
import { installFakeNativeLock, lockTool } from "./fake-native-lock";

/**
 * قفل التطبيق (1.28.0) في حزمة Android نفسها مع جسر أصلي وهمي (e2e/fake-native-lock.ts).
 * يغطي الواجهة والتكامل: التفعيل والإيقاف، والإقلاع البارد، وفترة السماح، والمحاولات، والاستعادة،
 * والروابط، والحجب. BiometricPrompt وKeystore وFLAG_SECURE الحقيقية تحتاج جهازاً (docs/APP_LOCK.md).
 */
const homeCtx = {
  account_kind: "student",
  is_teacher: false,
  children: 0,
  halaqas_joined: 1,
  halaqas_taught: 0,
  center_staff: false,
};

const SHOTS = "test-results/app-lock";
const lockScreen = (page: Page) => page.getByTestId("app-lock-screen");
// النوافذ المنبثقة (Radix) تخفي ما خلفها عن شجرة الوصول، فيُبحث عن المفتاح حتى لو كان مخفياً.
const enableSwitch = (page: Page) =>
  page.getByRole("switch", { name: "تفعيل قفل التطبيق", includeHidden: true });

async function setup(
  page: Page,
  opts: {
    caps?: Parameters<typeof installFakeNativeLock>[1];
    rejectLogin?: boolean;
    guest?: boolean;
  } = {},
) {
  const context = page.context();
  await installFakeSupabase(context, {
    user: opts.guest ? null : STUDENT,
    rpc: { my_home_context: homeCtx },
    rejectLogin: opts.rejectLogin,
  });
  if (opts.guest) {
    await context.addInitScript(() => {
      localStorage.setItem("zen-guest", "1");
      localStorage.setItem("zen-onboarded", "1");
    });
  } else {
    await seedSession(context, STUDENT);
  }
  await context.addInitScript(() => {
    // بيانات مستخدم يجب ألا يمسّها القفل أبداً.
    if (!localStorage.getItem("zen-e2e-userdata"))
      localStorage.setItem("zen-e2e-userdata", "keep-me");
  });
  await installFakeNativeLock(context, opts.caps);
}

async function typePin(page: Page, pin: string, pad = "pin-pad") {
  const scope = page.getByTestId(pad);
  for (const d of pin) await scope.getByRole("button", { name: `الرقم ${d}`, exact: true }).click();
}

/** يفعّل القفل برمز PIN من الإعدادات. */
async function enablePin(page: Page, pin = "3719") {
  await gotoReady(page, "/settings/lock");
  const sw = enableSwitch(page);
  await expect(sw).toBeEnabled();
  await sw.click();
  await expect(page.getByTestId("lock-setup")).toBeVisible();
  // لا يظهر مفعّلاً قبل اكتمال الإعداد.
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await page.getByTestId("setup-continue").click();
  await typePin(page, pin, "pin-pad-create");
  if (pin.length < 6) await page.getByTestId("pin-submit").click();
  await typePin(page, pin, "pin-pad-confirm");
  await expect(page.getByText("فُعّل قفل التطبيق.")).toBeVisible();
  await expect(sw).toHaveAttribute("aria-checked", "true");
}

async function noContentBehindLock(page: Page) {
  return page.evaluate(() =>
    Array.from(document.body.children)
      .filter((el) => el.id !== "zen-lock-layer" && el.tagName !== "SCRIPT")
      .map((el) => (el as HTMLElement).innerText.trim())
      .join(""),
  );
}

test("الويب بلا جسر أصلي: المفتاح معطّل مع السبب، والتطبيق بلا قفل", async ({ page, context }) => {
  await installFakeSupabase(context, { user: STUDENT, rpc: { my_home_context: homeCtx } });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/settings/lock");
  await expect(enableSwitch(page)).toBeDisabled();
  await expect(page.getByText("قفل التطبيق متاح في تطبيق زِن على أندرويد.")).toBeVisible();
  await expect(lockScreen(page)).toHaveCount(0);
});

test("التفعيل بـ PIN، ورفض الرمز الضعيف وغير المتطابق، ثم القفل عند الإقلاع", async ({ page }) => {
  await setup(page);
  await gotoReady(page, "/settings/lock");
  await expect(lockScreen(page)).toHaveCount(0);
  await enableSwitch(page).click();
  await page.getByTestId("setup-continue").click();
  // ضعيف
  await typePin(page, "1234", "pin-pad-create");
  await page.getByTestId("pin-submit").click();
  await expect(page.getByText(/سهل التخمين/)).toBeVisible();
  // غير متطابق
  await typePin(page, "3719", "pin-pad-create");
  await page.getByTestId("pin-submit").click();
  await typePin(page, "3718", "pin-pad-confirm");
  await expect(page.getByText("الرمزان غير متطابقين. أنشئ الرمز من جديد.")).toBeVisible();
  await expect(enableSwitch(page)).toHaveAttribute("aria-checked", "false");
  // صحيح
  await typePin(page, "3719", "pin-pad-create");
  await page.getByTestId("pin-submit").click();
  await typePin(page, "3719", "pin-pad-confirm");
  await expect(page.getByText("فُعّل قفل التطبيق.")).toBeVisible();
  const saved = await lockTool(page, (l) => l.persisted());
  expect(saved).toMatchObject({ enabled: true, method: "pin", graceMs: 0, hide: true });

  // إقلاع بارد: الشاشة أولاً، ولا محتوى خلفها، ولا خطأ ترطيب (#418) في مسار Android.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.reload();
  await expect(lockScreen(page)).toBeVisible();
  await expect(lockScreen(page).getByRole("heading", { name: "مرحبًا بعودتك" })).toBeVisible();
  await expect(lockScreen(page).getByText("زِن محمي بقفل التطبيق.")).toBeVisible();
  expect(await noContentBehindLock(page)).toBe("");
  await page.screenshot({ path: `${SHOTS}/lock-pin-ar.png` });
  expect(errors.filter((m) => /Minified React error|hydrat/i.test(m))).toEqual([]);

  // خاطئ ثم صحيح
  await typePin(page, "1111");
  await expect(page.getByTestId("lock-message")).toHaveText(/بقيت 4 محاولات/);
  await typePin(page, "3719");
  await expect(lockScreen(page)).toHaveCount(0);
  await expect(enableSwitch(page)).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("zen-e2e-userdata"))).toBe("keep-me");
});

test("المحاولات: انتظار متصاعد يبقى بعد إعادة التشغيل، ثم يُفتح بالرمز الصحيح", async ({
  page,
}) => {
  await setup(page);
  await enablePin(page);
  await page.reload();
  await expect(lockScreen(page)).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await typePin(page, "9999");
    await expect(page.getByTestId("pin-dots")).toHaveAttribute("data-filled", "0");
  }
  await expect(page.getByTestId("lock-message")).toHaveText(/حاول بعد 30 ثانية|حاول بعد 2\d ثانية/);
  await expect(page.getByRole("button", { name: "الرقم 1", exact: true })).toBeDisabled();
  // إعادة التشغيل لا تصفّر الانتظار.
  await page.reload();
  await expect(page.getByTestId("lock-message")).toHaveText(/حاول بعد/);
  await expect(page.getByRole("button", { name: "الرقم 1", exact: true })).toBeDisabled();
  // مرور الوقت (ساعة رتيبة وهمية) ثم العودة إلى التطبيق.
  await lockTool(page, (l) => {
    l.advance(31_000);
    l.background();
    l.foreground();
  });
  await expect(page.getByRole("button", { name: "الرقم 1", exact: true })).toBeEnabled();
  await typePin(page, "3719");
  await expect(lockScreen(page)).toHaveCount(0);
});

test("فترة السماح: فوري، و30 ثانية قبلها وبعدها، والتنقل الداخلي لا يغيّرها", async ({ page }) => {
  await setup(page);
  await enablePin(page);
  // فوري (الافتراضي)
  await lockTool(page, (l) => l.background());
  await lockTool(page, (l) => l.foreground());
  await expect(lockScreen(page)).toBeVisible();
  // القفل أثناء الاستخدام: المحتوى خلفه inert وaria-hidden.
  const inert = await page.evaluate(() =>
    Array.from(document.body.children)
      .filter((el) => el.id !== "zen-lock-layer" && el.tagName !== "SCRIPT")
      .every((el) => (el as HTMLElement).inert && el.getAttribute("aria-hidden") === "true"),
  );
  expect(inert).toBe(true);
  await typePin(page, "3719");
  await expect(lockScreen(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector("[inert]") === null)).toBe(true);

  // 30 ثانية
  await page.getByTestId("lock-grace-30000").click();
  await expect(page.getByTestId("lock-grace-30000")).toBeChecked();
  await expect.poll(() => lockTool(page, (l) => l.persisted().graceMs)).toBe(30_000);
  await lockTool(page, (l) => {
    l.background();
    l.advance(10_000);
    l.foreground();
  });
  await page.waitForTimeout(300);
  await expect(lockScreen(page)).toHaveCount(0);
  // التنقل الداخلي لا يقفل ولا يصفّر شيئاً.
  await gotoReady(page, "/settings/display");
  await page.goBack();
  await expect(lockScreen(page)).toHaveCount(0);
  await lockTool(page, (l) => {
    l.background();
    l.advance(40_000);
    l.foreground();
  });
  await expect(lockScreen(page)).toBeVisible();
});

test("الرابط الداخلي والرجوع لا يتجاوزان القفل", async ({ page }) => {
  await setup(page);
  await enablePin(page);
  // رابط مباشر إلى صفحة أخرى والتطبيق مقفل.
  await page.goto("/settings/display");
  await expect(lockScreen(page)).toBeVisible();
  expect(await noContentBehindLock(page)).toBe("");
  // زر الرجوع في أندرويد: ينقل التطبيق إلى الخلفية ولا يتنقّل.
  await lockTool(page, (l) => l.back());
  await expect(lockScreen(page)).toBeVisible();
  expect(await lockTool(page, (l) => l.calls.some((c) => c.method === "App.minimizeApp"))).toBe(
    true,
  );
  await typePin(page, "3719");
  await expect(lockScreen(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/display/);
});

test("الإيقاف يتطلب الرمز، ولا يحذف البيانات", async ({ page }) => {
  await setup(page);
  await enablePin(page);
  const sw = enableSwitch(page);
  await sw.click();
  await expect(page.getByTestId("lock-confirm")).toBeVisible();
  await typePin(page, "1111", "confirm-pin-pad");
  await expect(page.getByTestId("lock-confirm").getByText(/الرمز غير صحيح/)).toBeVisible();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await typePin(page, "3719", "confirm-pin-pad");
  await expect(page.getByText("أُوقف قفل التطبيق.")).toBeVisible();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  expect(await lockTool(page, (l) => l.persisted().enabled)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("zen-e2e-userdata"))).toBe("keep-me");
  await page.reload();
  await expect(enableSwitch(page)).toBeVisible();
  await expect(lockScreen(page)).toHaveCount(0);
});

test("تغيير الوسيلة إلى قفل الجهاز بعد التحقق، والإلغاء ثم إعادة المحاولة", async ({ page }) => {
  await setup(page);
  await enablePin(page);
  await page.getByTestId("lock-change-method").click();
  await typePin(page, "3719", "confirm-pin-pad");
  await expect(page.getByTestId("lock-setup")).toBeVisible();
  await page.getByTestId("setup-method-device").check();
  await page.getByTestId("setup-continue").click();
  await expect(page.getByText("حُفظت وسيلة القفل الجديدة.")).toBeVisible();
  await expect(page.getByTestId("lock-current-method")).toContainText("قفل الجهاز");
  expect(await lockTool(page, (l) => l.persisted())).toMatchObject({ method: "device", pin: null });

  // إقلاع بارد: نافذة النظام تلقائياً؛ الإلغاء يُبقي القفل مع «أعد المحاولة».
  await page.addInitScript(() => {
    const w = window as unknown as { __lock?: { queueAuth: (...r: string[]) => void } };
    const t = setInterval(() => {
      if (w.__lock) {
        w.__lock.queueAuth("canceled");
        clearInterval(t);
      }
    }, 0);
  });
  await page.reload();
  await expect(lockScreen(page)).toBeVisible();
  await expect(page.getByTestId("lock-message")).toHaveText(/أُلغي التحقق/);
  await page.screenshot({ path: `${SHOTS}/lock-device-canceled-ar.png` });
  await page.getByTestId("lock-unlock").click();
  await expect(lockScreen(page)).toHaveCount(0);
});

test("البصمة مع PIN: الفشل وقفل النظام رسائل واضحة، والرمز بديل دائم", async ({ page }) => {
  await setup(page);
  await enablePin(page);
  await page.getByRole("switch", { name: "الفتح بالبصمة أو الوجه" }).click();
  await expect(page.getByRole("switch", { name: "الفتح بالبصمة أو الوجه" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.addInitScript(() => {
    const w = window as unknown as { __lock?: { queueAuth: (...r: string[]) => void } };
    const t = setInterval(() => {
      if (w.__lock) {
        w.__lock.queueAuth("lockout", "lockout_permanent");
        clearInterval(t);
      }
    }, 0);
  });
  await page.reload();
  await expect(lockScreen(page)).toBeVisible();
  await expect(page.getByTestId("lock-message")).toHaveText(/محاولات كثيرة/);
  await page.getByTestId("pin-biometric").click();
  await expect(page.getByTestId("lock-message")).toHaveText(/موقوفة مؤقتًا من النظام/);
  await typePin(page, "3719");
  await expect(lockScreen(page)).toHaveCount(0);
});

test("جهاز بلا بصمة ولا قفل شاشة: الوسائل غير المتاحة معطّلة مع السبب، وتحذير الاستعادة", async ({
  page,
}) => {
  await setup(page, { caps: { biometric: "no_hardware", deviceSecure: false }, guest: true });
  await gotoReady(page, "/settings/lock");
  await enableSwitch(page).click();
  await expect(page.getByTestId("setup-method-device")).toBeDisabled();
  await expect(page.getByText(/لا يوجد قفل شاشة على الجهاز/).first()).toBeVisible();
  await expect(page.getByTestId("setup-with-bio")).toHaveCount(0);
  // لا وسيلة استعادة: تحذير وموافقة صريحة قبل الإنشاء.
  await expect(page.getByTestId("lock-no-recovery")).toBeVisible();
  await expect(page.getByTestId("setup-continue")).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/setup-no-recovery-ar.png` });
  await page.getByTestId("setup-ack").check();
  await page.getByTestId("setup-continue").click();
  await typePin(page, "3719", "pin-pad-create");
  await page.getByTestId("pin-submit").click();
  await typePin(page, "3719", "pin-pad-confirm");
  await expect(page.getByText("فُعّل قفل التطبيق.")).toBeVisible();
  await expect(page.getByRole("switch", { name: "الفتح بالبصمة أو الوجه" })).toBeDisabled();
  // «نسيت الرمز؟» بلا وسيلة: شرح صريح بلا تجاوز.
  await page.reload();
  await page.getByTestId("lock-forgot").click();
  await expect(page.getByTestId("recover-none")).toBeVisible();
  await expect(page.getByTestId("recover-device")).toHaveCount(0);
  await expect(lockScreen(page)).toBeVisible();
});

test("نسيت الرمز: الاستعادة بقفل الجهاز ثم رمز جديد، بلا حذف بيانات", async ({ page }) => {
  await setup(page);
  await enablePin(page);
  // 1.29.0 (H2): مع حساب مربوط تُطفأ الاستعادة بقفل الجهاز افتراضياً، وتفعيلها يطلب الرمز أولاً.
  expect(await lockTool(page, (l) => l.persisted())).toMatchObject({
    deviceRecovery: false,
    account: { email: "student@e2e.test" },
  });
  const devRec = page.getByRole("switch", { name: "الاستعادة بقفل الجهاز" });
  await devRec.click();
  await typePin(page, "3719", "confirm-pin-pad");
  await expect(devRec).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await page.getByTestId("lock-forgot").click();
  await page.getByTestId("recover-device").click();
  await expect(page.getByTestId("lock-reset")).toBeVisible();
  await page.getByTestId("reset-new-pin").click();
  await typePin(page, "7391", "pin-pad-create");
  await page.getByTestId("pin-submit").click();
  await typePin(page, "7391", "pin-pad-confirm");
  await expect(lockScreen(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("zen-e2e-userdata"))).toBe("keep-me");
  await page.reload();
  await typePin(page, "3719");
  await expect(page.getByTestId("lock-message")).toHaveText(/الرمز غير صحيح/);
  await typePin(page, "7391");
  await expect(lockScreen(page)).toHaveCount(0);
});

test("نسيت الرمز بكلمة مرور الحساب: بلا اتصال رسالة، والخاطئة مرفوضة، ثم الإيقاف", async ({
  page,
}) => {
  await setup(page, { caps: { deviceSecure: false } });
  await enablePin(page);
  await page.reload();
  await page.getByTestId("lock-forgot").click();
  await expect(page.getByTestId("recover-device")).toHaveCount(0);
  await page.getByTestId("recover-password").fill("secret-pass");
  await page.context().setOffline(true);
  await page.getByTestId("recover-verify").click();
  await expect(page.getByText(/لا اتصال الآن/)).toBeVisible();
  await expect(page.getByTestId("lock-reset")).toHaveCount(0);
  await page.context().setOffline(false);
  await page.getByTestId("recover-verify").click();
  await expect(page.getByTestId("lock-reset")).toBeVisible();
  await page.getByTestId("reset-turn-off").click();
  await expect(lockScreen(page)).toHaveCount(0);
  expect(await lockTool(page, (l) => l.persisted().enabled)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("zen-e2e-userdata"))).toBe("keep-me");
});

test("كلمة مرور خاطئة لا تمنح الاستعادة", async ({ page }) => {
  await setup(page, { caps: { deviceSecure: false }, rejectLogin: true });
  await enablePin(page);
  await page.reload();
  await page.getByTestId("lock-forgot").click();
  await page.getByTestId("recover-password").fill("wrong");
  await page.getByTestId("recover-verify").click();
  await expect(page.getByTestId("lock-recover").getByRole("alert")).not.toBeEmpty();
  await expect(page.getByTestId("lock-reset")).toHaveCount(0);
  await expect(lockScreen(page)).toBeVisible();
});

test("بلا اتصال: إعادة القفل والفتح بـ PIN محلياً", async ({ page }) => {
  await setup(page);
  await enablePin(page);
  // في Android ملفات الواجهة داخل الحزمة؛ هنا يأتي بها خادم الاختبار، فيُفتح التطبيق مرة بالاتصال
  // لتُحمَّل صفحاته، ثم يُقطع الاتصال.
  await page.reload();
  await typePin(page, "3719");
  await expect(enableSwitch(page)).toHaveAttribute("aria-checked", "true");
  await page.context().setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await lockTool(page, (l) => {
    l.background();
    l.foreground();
  });
  await expect(lockScreen(page)).toBeVisible();
  await typePin(page, "1111");
  await expect(page.getByTestId("lock-message")).toHaveText(/الرمز غير صحيح/);
  await typePin(page, "3719");
  await expect(lockScreen(page)).toHaveCount(0);
  await expect(enableSwitch(page)).toHaveAttribute("aria-checked", "true");
  await page.context().setOffline(false);
});

test("العربية ومقاسات الشاشة: RTL بلا تجاوز أفقي وأهداف لمس ≥ 56px", async ({ page }) => {
  await setup(page);
  await enablePin(page);
  for (const [w, h] of [
    [320, 568],
    [360, 740],
    [412, 915],
    [768, 1024],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.reload();
    await expect(lockScreen(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "الرقم 0", exact: true })).toBeInViewport();
    await expect(page.getByTestId("lock-forgot")).toBeInViewport();
    const m = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="app-lock-screen"]') as HTMLElement;
      const key = document.querySelector('[data-testid="pin-pad"] button') as HTMLElement;
      const r = key.getBoundingClientRect();
      return {
        overflow: el.scrollWidth > el.clientWidth,
        w: r.width,
        h: r.height,
        dir: document.dir,
      };
    });
    expect(m.overflow).toBe(false);
    expect(m.w).toBeGreaterThanOrEqual(56);
    expect(m.h).toBeGreaterThanOrEqual(56);
    expect(m.dir).toBe("rtl");
    await page.screenshot({ path: `${SHOTS}/lock-ar-${w}x${h}.png` });
  }
  await page.setViewportSize({ width: 412, height: 915 });
  await typePin(page, "3719");
  await expect(lockScreen(page)).toHaveCount(0);
});

test("صفحة الإعدادات بالعربية (لقطة) ومدخلها في فهرس الإعدادات", async ({ page }) => {
  await setup(page);
  await gotoReady(page, "/settings");
  await page.getByRole("link", { name: /قفل التطبيق/ }).click();
  await expect(page).toHaveURL(/\/settings\/lock/);
  await enablePin(page);
  await page.screenshot({ path: `${SHOTS}/settings-ar.png`, fullPage: true });
});

test("1.29.0: بلا تفعيل الاستعادة بقفل الجهاز لا يظهر خيارها، وكلمة المرور تُتحقق لدى الخادم", async ({
  page,
}) => {
  await setup(page);
  await enablePin(page);
  await page.reload();
  await page.getByTestId("lock-forgot").click();
  await expect(page.getByTestId("recover-device")).toHaveCount(0);
  await expect(page.getByText("student@e2e.test")).toBeVisible();
  await page.getByTestId("recover-password").fill("secret-pass");
  await page.getByTestId("recover-verify").click();
  await expect(page.getByTestId("lock-reset")).toBeVisible();
  const calls = await lockTool(page, (l) => l.calls.map((c) => c.method));
  expect(calls).toContain("ZenLock.grantAccountRecovery");
});

test("1.29.0: «اقفل الآن» وإطفاء الشاشة يقفلان فوراً، وإشعار المحاولات الخاطئة بعد الفتح", async ({
  page,
}) => {
  await setup(page);
  await enablePin(page);
  await page.getByTestId("lock-now").click();
  await expect(lockScreen(page)).toBeVisible();
  await typePin(page, "1111");
  await expect(page.getByTestId("lock-message")).toHaveText(/الرمز غير صحيح/);
  await typePin(page, "3719");
  await expect(lockScreen(page)).toHaveCount(0);
  await expect(page.getByText("حدثت محاولة خاطئة واحدة لفتح زِن منذ آخر مرة.")).toBeVisible();
  await expect.poll(() => lockTool(page, (l) => l.persisted().failedSinceUnlock)).toBe(0);
  // إطفاء الشاشة يُقفل حتى مع فترة السماح.
  await lockTool(page, (l) => l.screenOff());
  await expect(lockScreen(page)).toBeVisible();
  await typePin(page, "3719");
  await expect(lockScreen(page)).toHaveCount(0);
});

test("1.29.0: الخمول ونص الإشعارات يُحفظان في الطبقة الأصلية، وتلميح قوة الرمز", async ({
  page,
}) => {
  await setup(page);
  await gotoReady(page, "/settings/lock");
  await enableSwitch(page).click();
  await page.getByTestId("setup-continue").click();
  await typePin(page, "1990", "pin-pad-create");
  await expect(page.getByTestId("pin-strength")).toHaveAttribute("data-strength", "weak");
  await page.getByTestId("pin-submit").click();
  await expect(page.getByText(/سهل التخمين/)).toBeVisible();
  await typePin(page, "3719", "pin-pad-create");
  await page.getByTestId("pin-submit").click();
  await typePin(page, "3719", "pin-pad-confirm");
  await expect(page.getByText("فُعّل قفل التطبيق.")).toBeVisible();
  await page.getByTestId("lock-idle-300000").click();
  await expect(page.getByTestId("lock-idle-300000")).toBeChecked();
  await page.getByRole("switch", { name: "إخفاء نص الإشعارات على شاشة قفل الجهاز" }).click();
  await expect
    .poll(() => lockTool(page, (l) => l.persisted()))
    .toMatchObject({ idleMs: 300_000, privateNotif: false });
});

test("1.29.0: قراءة المصحف دون فتح القفل تعرض صفحة القراءة وحدها وتعود إلى شاشة القفل", async ({
  page,
}) => {
  await setup(page);
  await enablePin(page);
  await page.getByRole("switch", { name: "قراءة المصحف دون فتح القفل" }).click();
  await expect.poll(() => lockTool(page, (l) => l.persisted().quran)).toBe(true);
  await page.reload();
  await expect(lockScreen(page)).toBeVisible();
  await page.getByTestId("lock-read-quran").click();
  await expect(page).toHaveURL(/\/mushaf\/read/);
  await expect(lockScreen(page)).toHaveCount(0);
  await expect(page.getByTestId("quran-while-locked")).toBeVisible();
  // الطبقة الأصلية ما زالت مقفلة.
  expect(await lockTool(page, (l) => l.persisted().enabled)).toBe(true);
  await page.getByTestId("quran-back-to-lock").click();
  await expect(lockScreen(page)).toBeVisible();
  await typePin(page, "3719");
  await expect(lockScreen(page)).toHaveCount(0);
});
