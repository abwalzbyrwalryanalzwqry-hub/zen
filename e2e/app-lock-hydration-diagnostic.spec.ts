import { expect, test, type Page } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";
import { installFakeNativeLock } from "./fake-native-lock";

const homeCtx = {
  account_kind: "student",
  is_teacher: false,
  children: 0,
  halaqas_joined: 1,
  halaqas_taught: 0,
  center_staff: false,
};

async function typePin(page: Page, pin: string, pad: string) {
  const keypad = page.getByTestId(pad);
  for (const digit of pin) {
    await keypad.getByRole("button", { name: `الرقم ${digit}`, exact: true }).click();
  }
}

async function hydrationContext(page: Page) {
  return page.evaluate(() => {
    const capacitor = (window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }).Capacitor;
    const fakeLock = (window as unknown as {
      __lock?: { persisted?: () => unknown };
    }).__lock;
    return {
      url: location.href,
      document: {
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        className: document.documentElement.className,
        body: document.body.innerHTML.slice(0, 5000),
      },
      capacitor: {
        platform: capacitor?.getPlatform?.() ?? null,
        native: capacitor?.isNativePlatform?.() ?? null,
      },
      fakeLock: fakeLock?.persisted?.() ?? null,
    };
  });
}

test("تشخيص hydration لشاشة قفل Android", async ({ page }) => {
  const context = page.context();
  await installFakeSupabase(context, {
    user: STUDENT,
    rpc: { my_home_context: homeCtx },
  });
  await seedSession(context, STUDENT);
  await context.addInitScript(() => {
    localStorage.setItem("zen-e2e-userdata", "keep-me");
  });
  await installFakeNativeLock(context);

  const pageErrors: string[] = [];
  const hydrationConsole: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (/hydration|server rendered|didn't match|error #418/i.test(text)) {
      hydrationConsole.push(text);
    }
  });

  await gotoReady(page, "/settings/lock");
  await page.getByRole("switch", { name: "تفعيل قفل التطبيق", includeHidden: true }).click();
  await page.getByTestId("setup-continue").click();
  await typePin(page, "3719", "pin-pad-create");
  await page.getByTestId("pin-submit").click();
  await typePin(page, "3719", "pin-pad-confirm");
  await expect(page.getByText("فُعّل قفل التطبيق.")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("app-lock-screen")).toBeVisible();
  const hydrationErrors = pageErrors.filter((message) => /Minified React error|hydrat/i.test(message));
  if (hydrationErrors.length || hydrationConsole.length) {
    console.error(
      "LOCK_HYDRATION_DIAGNOSTICS",
      JSON.stringify({ hydrationErrors, hydrationConsole, context: await hydrationContext(page) }),
    );
  }
  expect(
    hydrationErrors,
    JSON.stringify({ hydrationConsole, context: hydrationErrors.length ? await hydrationContext(page) : null }),
  ).toEqual([]);
});